<script lang="ts">
import { mixins } from "vue-class-component";
import { Component, Vue, Watch } from 'vue-property-decorator';

import ManagerInformation from "../../_managerinf/ManagerInformation";
import R2Error from "../../model/errors/R2Error";
import ExportFormat from "../../model/exports/ExportFormat";
import ExportMod from "../../model/exports/ExportMod";
import ThunderstoreCombo from "../../model/ThunderstoreCombo";
import ThunderstoreMod from "../../model/ThunderstoreMod";
import ThunderstoreDownloaderProvider from "../../providers/ror2/downloading/ThunderstoreDownloaderProvider";
import InteractionProvider from "../../providers/ror2/system/InteractionProvider";
import { ProfileImportExport } from "../../r2mm/mods/ProfileImportExport";
import { sleep } from "../../utils/Common";
import { valueToReadableDate } from "../../utils/DateUtils";
import * as ProfileUtils from "../../utils/ProfileUtils";
import { ModalCard } from "../all";
import Progress from "../Progress.vue";
import OnlineModList from "../views/OnlineModList.vue";
import { useProfilesComposable } from '../composables/ProfilesComposable';

const VALID_PROFILE_CODE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Component({
    components: {Progress, OnlineModList, ModalCard}
})
export default class ImportProfileModal extends Vue {
    valueToReadableDate = valueToReadableDate;
    private importUpdateSelection: 'CREATE' | 'UPDATE' = 'CREATE';
    private importPhaseDescription: string = 'Downloading mods: 0%';
    private importViaCodeInProgress: boolean = false;
    private profileImportCode: string = '';
    private targetProfileName: string = '';
    private profileImportFilePath: string | null = null;
    private profileImportContent: ExportFormat | null = null;
    private profileMods: {known: ThunderstoreCombo[], unknown: string[]} = {known: [], unknown: []};
    private isPartialImportAllowed: boolean = false;
    private activeStep:
        'FILE_CODE_SELECTION'
        | 'IMPORT_FILE'
        | 'IMPORT_CODE'
        | 'REFRESH_MOD_LIST'
        | 'REVIEW_IMPORT'
        | 'IMPORT_UPDATE_SELECTION'
        | 'ADDING_PROFILE'
        | 'PROFILE_IS_BEING_IMPORTED'
    = 'FILE_CODE_SELECTION';

    get appName(): string {
        return ManagerInformation.APP_NAME;
    }

    get isOpen(): boolean {
        return this.$store.state.modals.isImportProfileModalOpen;
    }

    get doesProfileExist() {
        const { doesProfileExist } = useProfilesComposable();
        return doesProfileExist;
    }

    get makeProfileNameSafe() {
        const { makeProfileNameSafe } = useProfilesComposable();
        return makeProfileNameSafe;
    }

    get profileList() {
        return this.$store.state.profiles.profileList;
    }

    closeModal() {
        this.activeStep = 'FILE_CODE_SELECTION';
        this.targetProfileName = '';
        this.importUpdateSelection = 'CREATE';
        this.importViaCodeInProgress = false;
        this.profileImportCode = '';
        this.profileImportFilePath = null;
        this.profileImportContent = null;
        this.profileMods = {known: [], unknown: []};
        this.$store.commit('closeImportProfileModal');
    }

    get knownProfileMods(): ThunderstoreMod[] {
        return this.profileMods.known.map((combo) => combo.getMod());
    }

    get unknownProfileModNames(): string {
        return this.profileMods.unknown.join(', ');
    }

    // Required to trigger a re-render of the modlist in preview step
    // when the online modlist is refreshed.
    @Watch('$store.state.tsMods.mods')
    async updateProfileModsOnOnlineModListRefresh() {
        if (this.profileImportContent === null) {
            return;
        }

        this.profileMods = await ProfileUtils.exportModsToCombos(
            this.profileImportContent.getMods(),
            this.$store.state.activeGame
        );
    }

    get isProfileCodeValid(): boolean {
        return VALID_PROFILE_CODE_REGEX.test(this.profileImportCode);
    }

    // Fired when user selects to import either from file or code.
    async onFileOrCodeSelect(mode: 'FILE' | 'CODE') {
        if (mode === 'FILE') {
            this.activeStep = 'IMPORT_FILE';
            process.nextTick(async () => {
                const files = await InteractionProvider.instance.selectFile({
                    title: 'Import Profile',
                    filters: [{
                        name: "*",
                        extensions: ["r2z"]
                    }],
                    buttonLabel: 'Import'
                });
                await this.validateProfileFile(files);
            });
        } else {
            this.activeStep = 'IMPORT_CODE';
        }
    }

    // Fired when user has entered a profile code to import.
    async onProfileCodeEntered() {
        try {
            this.importViaCodeInProgress = true;
            const filepath = await ProfileImportExport.downloadProfileCode(this.profileImportCode.trim());
            await this.validateProfileFile([filepath]);
        } catch (e: any) {
            const err = R2Error.fromThrownValue(e, 'Failed to import profile');
            this.$store.commit('error/handleError', err);
        } finally {
            this.importViaCodeInProgress = false;
        }
    }

    // Check that selected profile zip is valid and proceed.
    async validateProfileFile(files: string[] | null) {
        if (files === null || files.length === 0) {
            this.closeModal();
            return;
        }

        try {
            const yamlContent = await ProfileUtils.readProfileFile(files[0]);
            this.profileImportContent = await ProfileUtils.parseYamlToExportFormat(yamlContent);
            this.profileMods = await ProfileUtils.exportModsToCombos(
                this.profileImportContent.getMods(),
                this.$store.state.activeGame
            );
        } catch (e: unknown) {
            const err = R2Error.fromThrownValue(e);
            this.$store.commit('error/handleError', err);
            this.closeModal();
            return;
        }

        this.profileImportFilePath = files[0];

        if (this.profileMods.unknown.length > 0) {
            // Sometimes the reason some packages are unknown is that
            // the mod list is out of date, so let's try refreshing it
            this.activeStep = 'REFRESH_MOD_LIST';

            // Mod downloads in progress will prevent mod list refresh, so wait
            // them out first.
            while (this.$store.getters['download/activeDownloadCount'] > 0) {
                await sleep(100);
            }

            // Awaiting the sync doesn't work here as the function will immediately
            // return if the process is already in progress, e.g. when the splash
            // screen has started the process in the background. Use while-loop
            // instead to wait in this screen.
            try {
                await this.$store.dispatch('tsMods/syncPackageList');
            } catch (e: unknown) {
                const err = R2Error.fromThrownValue(e);
                this.$store.commit('error/handleError', err);
                this.closeModal();
                return;
            }

            while (this.$store.state.tsMods.isThunderstoreModListUpdateInProgress) {
                await sleep(100);
            }
        }

        this.activeStep = 'REVIEW_IMPORT';
    }

    // Fired when user has accepted the mods to be imported in the review phase.
    async onProfileReviewConfirmed() {
        const profileContent = this.profileImportContent;
        const filePath = this.profileImportFilePath;

        // Check and return early for better UX.
        if (profileContent === null || filePath === null) {
            this.onContentOrPathNotSet();
            return;
        }

        this.targetProfileName = profileContent.getProfileName();
        this.activeStep = 'IMPORT_UPDATE_SELECTION';
    }

    // Fired when user selects whether to import a new profile or update existing one.
    onCreateOrUpdateSelect(mode: 'CREATE' | 'UPDATE') {
        this.importUpdateSelection = mode;

        if (mode === 'UPDATE') {
            this.targetProfileName = this.$store.getters['profile/activeProfileName'];
        }

        this.activeStep = 'ADDING_PROFILE';
    }

    // Fired when user confirms the import target location (new or existing profile).
    async onImportTargetSelected() {
        const profileContent = this.profileImportContent;
        const filePath = this.profileImportFilePath;

        // Recheck to ensure values haven't changed and to satisfy TypeScript.
        if (profileContent === null || filePath === null) {
            this.onContentOrPathNotSet();
            return;
        }

        const targetProfileName = this.makeProfileNameSafe(this.targetProfileName);

        // Sanity check, should not happen.
        if (targetProfileName === '') {
            const err = new R2Error("Can't import profile: unknown target profile", "Please try again");
            this.$store.commit('error/handleError', err);
            return;
        }

        if (this.importUpdateSelection === 'CREATE') {
            try {
                await this.$store.dispatch('profiles/addProfile', targetProfileName);
            } catch (e) {
                this.closeModal();
                const err = R2Error.fromThrownValue(e, 'Error while creating profile');
                this.$store.commit('error/handleError', err);
                return;
            }
        }

        await this.importProfile(targetProfileName, profileContent.getMods(), filePath);
    }

    async importProfile(targetProfileName: string, mods: ExportMod[], zipPath: string) {
        this.activeStep = 'PROFILE_IS_BEING_IMPORTED';
        this.importPhaseDescription = 'Downloading mods: 0%';
        const progressCallback = (progress: number|string) => typeof progress === "number"
            ? this.importPhaseDescription = `Downloading mods: ${Math.floor(progress)}%`
            : this.importPhaseDescription = progress;
        const ignoreCache = this.$store.state.download.ignoreCache;
        const isUpdate = this.importUpdateSelection === 'UPDATE';

        try {
            const comboList = this.profileMods.known;
            await ThunderstoreDownloaderProvider.instance.downloadImportedMods(comboList, ignoreCache, progressCallback);
            await ProfileUtils.populateImportedProfile(comboList, mods, targetProfileName, isUpdate, zipPath, progressCallback);
        } catch (e) {
            await this.$store.dispatch('profiles/ensureProfileExists');
            this.closeModal();
            this.$store.commit('error/handleError', R2Error.fromThrownValue(e));
            return;
        }

        await this.$store.dispatch('profiles/setSelectedProfile', {profileName: targetProfileName, prewarmCache: true});
        this.closeModal();
    }

    onContentOrPathNotSet() {
        this.closeModal();
        const reason = `content is ${this.profileImportContent ? 'not' : ''} null, file path is ${this.profileImportFilePath ? 'not' : ''} null`;
        this.$store.commit('error/handleError', R2Error.fromThrownValue(`Can't install profile: ${reason}`));
    }
}
</script>

<template>
    <ModalCard id="import-profile-from-file-or-code-modal" v-if="activeStep === 'FILE_CODE_SELECTION'" key="FILE_CODE_SELECTION" :is-active="isOpen" @close-modal="closeModal">
        <template v-slot:header>
            <h2 class="modal-title" v-if="importUpdateSelection === 'CREATE'">How are you importing a profile?</h2>
            <h2 class="modal-title" v-if="importUpdateSelection === 'UPDATE'">How are you updating your profile?</h2>
        </template>
        <template v-slot:footer>
            <button id="modal-import-profile-file"
                    class="button is-info"
                    @click="onFileOrCodeSelect('FILE')">From file</button>
            <button id="modal-import-profile-code"
                    class="button is-primary"
                    @click="onFileOrCodeSelect('CODE')">From code</button>
        </template>
    </ModalCard>

    <ModalCard id="import-profile-from-file-modal" v-else-if="activeStep === 'IMPORT_FILE'" key="IMPORT_FILE" :is-active="isOpen" @close-modal="closeModal">
        <template v-slot:header>
            <h2 class="modal-title">Loading file</h2>
        </template>
        <template v-slot:footer>
            <p>A file selection window will appear. Once a profile has been selected it may take a few moments.</p>
        </template>
    </ModalCard>

    <ModalCard id="import-profile-from-code-modal" v-else-if="activeStep === 'IMPORT_CODE'" :can-close="!importViaCodeInProgress" key="IMPORT_CODE" :is-active="isOpen" @close-modal="closeModal">
        <template v-slot:header>
            <h2 class="modal-title">Enter the profile code</h2>
        </template>
        <template v-slot:body>
            <input
                v-model="profileImportCode"
                @keyup.enter="isProfileCodeValid && !importViaCodeInProgress && onProfileCodeEntered()"
                id="import-profile-modal-profile-code"
                class="input"
                type="text"
                ref="profileCodeInput"
                placeholder="Enter the profile code"
                autocomplete="off"
            />
            <br />
            <br />
            <span class="tag is-danger" v-if="profileImportCode !== '' && !isProfileCodeValid">
                Invalid code, check for typos
            </span>
        </template>
        <template v-slot:footer>
            <button
                :disabled="!isProfileCodeValid || importViaCodeInProgress"
                id="modal-import-profile-from-code"
                class="button is-info"
                @click="onProfileCodeEntered();">
                {{importViaCodeInProgress ? 'Loading...' : 'Continue'}}
            </button>
        </template>
    </ModalCard>

    <ModalCard id="import-profile-refresh-mod-list-modal" v-else-if="activeStep === 'REFRESH_MOD_LIST'" key="REFRESH_MOD_LIST" :is-active="isOpen" :can-close="false">
        <template v-slot:header>
            <h2 class="modal-title">Refreshing online mod list</h2>
        </template>
        <template v-slot:footer>
            <div>
                <p>
                    Some of the packages in the profile are not recognized by the mod manager.
                    Refreshing the online mod list might fix the problem. Please wait...
                </p>
                <p v-if="$store.getters['download/activeDownloadCount'] > 0" class="margin-top">
                    Waiting for mod downloads to finish before refreshing the online mod list...
                </p>
                <p v-else class="margin-top"></p>
                    {{$store.state.tsMods.thunderstoreModListUpdateStatus}}
                </p>
            </div>
        </template>
    </ModalCard>

    <ModalCard id="review-profile-import-modal" v-else-if="activeStep === 'REVIEW_IMPORT'" key="REVIEW_IMPORT" :is-active="isOpen" @close-modal="closeModal">
        <template v-slot:header>
            <h2 class="modal-title">Packages to be installed</h2>
        </template>
        <template v-slot:body>
            <div v-if="knownProfileMods.length === 0 || profileMods.unknown.length > 0" class="notification is-warning">
                <p>These packages in the profile were not found on Thunderstore and will not be installed:</p>
                <p class="margin-top">{{ unknownProfileModNames }}</p>

                <p v-if="knownProfileMods.length === 0" class="margin-top">
                    Ensure the profile is intended for the currently selected game.
                </p>
            </div>

            <p v-if="knownProfileMods.length > 0 && profileMods.unknown.length > 0" class="margin-bottom">These packages will be installed:</p>
            <OnlineModList
                v-if="knownProfileMods.length > 0"
                :paged-mod-list="knownProfileMods"
                :read-only="true"
            />
        </template>
        <template v-slot:footer>

            <div v-if="knownProfileMods.length > 0 && profileMods.unknown.length > 0" class="is-flex-grow-1">
                <input
                    v-model="isPartialImportAllowed"
                    id="partialImportAllowedCheckbox"
                    class="is-checkradio has-background-color"
                    type="checkbox"
                >
                <label for="partialImportAllowedCheckbox">I understand that some of the mods won't be imported</label>
            </div>

            <button
                id="modal-review-confirmed"
                class="button is-info"
                :disabled="knownProfileMods.length === 0 || (profileMods.unknown.length > 0 && !isPartialImportAllowed)"
                @click="onProfileReviewConfirmed"
            >
                Import
            </button>

        </template>
    </ModalCard>

    <ModalCard id="import-or-update-profile-selection-modal" v-else-if="activeStep === 'IMPORT_UPDATE_SELECTION'" key="IMPORT_UPDATE_SELECTION" :is-active="isOpen" @close-modal="closeModal">
        <template v-slot:header>
            <h2 class="modal-title">Are you going to be updating an existing profile or creating a new one?</h2>
        </template>
        <template v-slot:footer>
            <button id="modal-import-new-profile"
                    class="button is-info"
                    @click="onCreateOrUpdateSelect('CREATE')">
                Import new profile
            </button>
            <button id="modal-update-existing-profile"
                    class="button is-primary"
                    @click="onCreateOrUpdateSelect('UPDATE')">
                Update existing profile
            </button>
        </template>
    </ModalCard>

    <ModalCard id="import-add-profile-modal" v-else-if="activeStep === 'ADDING_PROFILE'" key="ADDING_PROFILE" :is-active="isOpen" @close-modal="closeModal">
        <template v-slot:header>
            <h2 v-if="importUpdateSelection === 'CREATE'" class="modal-title">Import a profile</h2>
        </template>
        <template v-slot:body v-if="importUpdateSelection === 'CREATE'">
            <p>This profile will store its own mods independently from other profiles.</p>
            <br/>
            <input
                v-model="targetProfileName"
                id="import-profile-modal-new-profile-name"
                class="input"
                type="text"
                ref="profileNameInput"
                autocomplete="off"
            />
            <br/><br/>
            <span class="tag is-dark" v-if="makeProfileNameSafe(targetProfileName) === ''">
                Profile name required
            </span>
            <span class="tag is-success" v-else-if="!doesProfileExist(targetProfileName)">
                "{{makeProfileNameSafe(targetProfileName)}}" is available
            </span>
            <span class="tag is-danger" v-else>
                "{{makeProfileNameSafe(targetProfileName)}}" is either already in use, or contains invalid characters
            </span>
        </template>
        <template v-slot:body v-else-if="importUpdateSelection === 'UPDATE'">
            <div class="notification is-warning">
                <p>All contents of the profile will be overwritten with the contents of the code/file.</p>
            </div>
            <p>Select a profile below:</p>
            <br/>
            <select class="select" v-model="targetProfileName">
                <option v-for="profile of profileList" :key="profile">{{ profile }}</option>
            </select>
        </template>
        <template v-slot:footer v-if="importUpdateSelection === 'CREATE'">
            <button id="modal-create-profile-invalid" class="button is-danger" v-if="doesProfileExist(targetProfileName)">Create</button>
            <button id="modal-create-profile" class="button is-info" v-else @click="onImportTargetSelected()">Create</button>
        </template>
        <template v-slot:footer v-else-if="importUpdateSelection === 'UPDATE'">
            <button id="modal-update-profile-invalid" class="button is-danger" v-if="!doesProfileExist(targetProfileName)">Update profile: {{ targetProfileName }}</button>
            <button id="modal-update-profile" class="button is-info" v-else @click="onImportTargetSelected()">Update profile: {{ targetProfileName }}</button>
        </template>
    </ModalCard>

    <ModalCard id="profile-importing-in-progress-modal" v-else-if="activeStep === 'PROFILE_IS_BEING_IMPORTED'" key="PROFILE_IS_BEING_IMPORTED" :is-active="isOpen" :canClose="false">
        <template v-slot:header>
            <h2 class="modal-title">{{importPhaseDescription}}</h2>
        </template>
        <template v-slot:footer>
            <p>
                This may take a while, as files are being downloaded, extracted, and copied.
                <br><br>
                Please do not close {{appName}}.
            </p>
        </template>
    </ModalCard>
</template>

<style scoped>
.modal-title {
    font-size: 1.5rem;
}
</style>
