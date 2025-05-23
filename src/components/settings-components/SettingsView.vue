<template>
    <div id="settings-view">
        <Hero title='Settings'
              :subtitle='`Advanced options for ${appName}: ` + managerVersionNumber.toString()'
              heroType='primary'/>
        <div class="margin-right">
            <div class="sticky-top sticky-top--opaque sticky-top--no-shadow sticky-top--no-padding">
                <div class='border-at-bottom'>
                    <div class='card is-shadowless is-square'>
                        <div class='card-header-title'>
                            <span class="non-selectable margin-right">Search:</span>
                            <input v-model='search' class="input" type="text" placeholder="Search for a setting"/>
                        </div>
                    </div>
                </div>
                <div class="tabs">
                    <ul>
                        <li v-for="(key, index) in tabs" :key="`tab-${key}`"
                            :class="[{'is-active': activeTab === key}]"
                            @click="changeTab(key)">
                            <a>{{key}}</a>
                        </li>
                    </ul>
                </div>
            </div>
            <template v-if="activeTab === 'All'">
                <SettingsItem v-for="(key, _) in searchableSettings" :key="`setting-${key.action}`"
                              :action="key.action"
                              :description="key.description"
                              :value="key.value"
                              :icon="key.icon"
                              @click="key.clickAction()"/>
            </template>
            <template v-else>
                <SettingsItem v-for="(key, _) in getFilteredSettings()" :key="`setting-${key.action}`"
                              :action="key.action"
                              :description="key.description"
                              :value="key.value"
                              :icon="key.icon"
                              @click="key.clickAction()"/>
            </template>
        </div>
    </div>
</template>

<script lang="ts">

import { Vue, Watch } from 'vue-property-decorator';
import Component from 'vue-class-component';
import SettingsItem from './SettingsItem.vue';
import SettingsRow from '../../model/settings/SettingsRow';
import ManagerSettings from '../../r2mm/manager/ManagerSettings';
import GameDirectoryResolverProvider from '../../providers/ror2/game/GameDirectoryResolverProvider';
import R2Error from '../../model/errors/R2Error';
import PathResolver from '../../r2mm/manager/PathResolver';
import LogOutputProvider from '../../providers/ror2/data/LogOutputProvider';
import VersionNumber from '../../model/VersionNumber';
import ManagerInformation from '../../_managerinf/ManagerInformation';
import { Hero } from '../all';
import ProfileModList from '../../r2mm/mods/ProfileModList';
import ManifestV2 from '../../model/ManifestV2';
import Game from '../../model/game/Game';
import { StorePlatform } from '../../model/game/StorePlatform';
import moment from 'moment';
import CdnProvider from '../../providers/generic/connection/CdnProvider';

@Component({
        components: {
            SettingsItem,
            Hero
        }
    })
    export default class SettingsView extends Vue {

        private activeTab: string = 'All';
        private tabs = ['All', 'Profile', 'Locations', 'Debugging', 'Modpacks', 'Other'];
        private logOutput: LogOutputProvider = LogOutputProvider.instance;
        private search: string = '';
        private managerVersionNumber: VersionNumber = ManagerInformation.VERSION;
        private searchableSettings: SettingsRow[] = [];

        get activeGame(): Game {
            return this.$store.state.activeGame;
        }

        get settings(): ManagerSettings {
            return this.$store.getters['settings'];
        };

        get localModList(): ManifestV2[] {
            return this.$store.state.profile.modList;
        }

        get appName(): string {
            return ManagerInformation.APP_NAME;
        }

        private settingsList = [
            new SettingsRow(
                'Locations',
                'Browse data folder',
                'Open the folder where mods are stored for all games and profiles.',
                async () => PathResolver.ROOT,
                'fa-door-open',
                () => {
                    this.emitInvoke('BrowseDataFolder');
                }
            ),
            new SettingsRow(
                'Locations',
                `Change ${this.activeGame.displayName} folder`,
                `Change the location of the ${this.activeGame.displayName} folder that ${this.appName} uses.`,
                async () => {
                    if (this.settings.getContext().gameSpecific.gameDirectory !== null) {
                        const directory = await GameDirectoryResolverProvider.instance.getDirectory(this.activeGame);
                        if (!(directory instanceof R2Error)) {
                            return directory;
                        }
                    }
                    return 'Please set manually';
                },
                'fa-folder-open',
                () => {
                    if (StorePlatform.XBOX_GAME_PASS == this.activeGame.activePlatform.storePlatform) {
                        this.emitInvoke('ChangeGameDirectoryGamePass');
                    }
                    else {
                        this.emitInvoke('ChangeGameDirectory');
                    }
                }
            ),
            new SettingsRow(
                'Locations',
                'Browse profile folder',
                'Open the folder where mods are stored for the current profile.',
                async () => {
                    return this.$store.getters['profile/activeProfile'].getProfilePath();
                },
                'fa-door-open',
                () => this.emitInvoke('BrowseProfileFolder')
            ),
            new SettingsRow(
                'Locations',
                'Change data folder',
                'Change the folder where mods are stored for all games and profiles. The folder will not be deleted, and existing profiles will not carry across.',
                async () => {
                    return PathResolver.ROOT;
                },
                'fa-folder-open',
                () => this.emitInvoke('ChangeDataFolder')
            ),
            new SettingsRow(
                'Debugging',
                'Copy log file contents to clipboard',
                'Copy the text inside the LogOutput.log file to the clipboard, with Discord formatting.',
                async () => this.doesLogFileExist(),
                'fa-clipboard',
                () => this.emitInvoke('CopyLogToClipboard')
            ),
            new SettingsRow(
                'Debugging',
                'Copy troubleshooting information to clipboard',
                'Copy settings and other information to the clipboard, with Discord formatting.',
                async () => 'Share this information when requesting support on Discord.',
                'fa-clipboard',
                () => this.emitInvoke('CopyTroubleshootingInfoToClipboard')
            ),
            new SettingsRow(
                'Debugging',
                'Toggle download cache',
                'Downloading a mod will ignore mods stored in the cache. Mods will still be placed in the cache.',
                async () => {
                    return this.$store.state.download.ignoreCache
                        ? 'Current: cache is disabled'
                        : 'Current: cache is enabled (recommended)';
                },
                'fa-exchange-alt',
                () => this.emitInvoke('ToggleDownloadCache')
            ),
            new SettingsRow(
                'Debugging',
                'Set launch parameters',
                'Provide custom arguments used to start the game.',
                async () => 'These commands are used against the Steam executable on game startup',
                'fa-wrench',
                () => this.emitInvoke('SetLaunchParameters')
            ),
            new SettingsRow(
                'Debugging',
                'Clean mod cache',
                'Free extra space caused by cached mods that are not currently in a profile.',
                async () => 'Check all profiles for unused mods and clear cache',
                'fa-trash',
                () => this.emitInvoke('CleanCache')
            ),
            new SettingsRow(
                'Debugging',
                'Clean online mod list',
                'Deletes local copy of mod list, forcing the next refresh to fetch a new one.',
                async () => this.$store.dispatch('tsMods/getActiveGameCacheStatus'),
                'fa-trash',
                () => this.$store.dispatch('tsMods/resetActiveGameCache')
            ),
            new SettingsRow(
                'Debugging',
                'Toggle preferred Thunderstore CDN',
                'Switch the CDN until app is restarted. This might bypass issues with downloading mods.',
                async () => `Current: ${CdnProvider.current.label} (${CdnProvider.current.url})`,
                'fa-exchange-alt',
                CdnProvider.togglePreferredCdn
            ),
            new SettingsRow(
                'Profile',
                'Change profile',
                'Change the mod profile.',
                async () => {
                    return `Current profile: ${this.$store.getters['profile/activeProfile'].getProfileName()}`
                },
                'fa-file-import',
                () => this.emitInvoke('ChangeProfile')
            ),
            new SettingsRow(
                'Profile',
                'Enable all mods',
                'Enable all mods for the current profile',
                async () => `${this.localModList.length - ProfileModList.getDisabledModCount(this.localModList)}/${this.localModList.length} enabled`,
                'fa-file-import',
                () => this.emitInvoke('EnableAll')
            ),
            new SettingsRow(
                'Profile',
                'Disable all mods',
                'Disable all mods for the current profile',
                async () => `${ProfileModList.getDisabledModCount(this.localModList)}/${this.localModList.length} disabled`,
                'fa-file-import',
                () => this.emitInvoke('DisableAll')
            ),
            new SettingsRow(
                'Profile',
                'Import local mod',
                'Install a mod offline from your files.',
                async () => 'Not all mods can be installed locally',
                'fa-file-import',
                () => this.$store.commit("openLocalFileImportModal")
            ),
            new SettingsRow(
                'Profile',
                'Export profile as a file',
                'Export your mod list and configs as a file.',
                async () => 'The exported file can be shared with friends to get an identical profile quickly and easily',
                'fa-file-export',
                () => this.$store.dispatch("profileExport/exportProfileAsFile")
            ),
            new SettingsRow(
                'Profile',
                'Export profile as a code',
                'Export your mod list and configs as a code.',
                async () => 'The exported code can be shared with friends to get an identical profile quickly and easily',
                'fa-file-export',
                () => this.$store.dispatch("profileExport/exportProfileAsCode")
            ),
            new SettingsRow(
                'Profile',
                'Update all mods',
                'Quickly update every installed mod to their latest versions.',
                async () => {
                    const outdatedMods = this.$store.getters['profile/modsWithUpdates'];
                    if (outdatedMods.length === 1) {
                        return "1 mod has an update available";
                    }
                    return `${outdatedMods.length} mods have an update available`;
                },
                'fa-cloud-upload-alt',
                () => this.emitInvoke('UpdateAllMods')
            ),
            new SettingsRow(
                'Other',
                'Toggle funky mode',
                'Enable/disable funky mode.',
                async () => {
                    return this.settings.getContext().global.funkyModeEnabled
                        ? 'Current: enabled'
                        : 'Current: disabled (default)';
                },
                'fa-exchange-alt',
                () => this.emitInvoke('ToggleFunkyMode')
            ),
            new SettingsRow(
                'Other',
                'Switch theme',
                'Switch between light and dark themes.',
                async () => {
                    return this.settings.getContext().global.darkTheme
                        ? 'Current: dark theme'
                        : 'Current: light theme (default)';
                },
                'fa-exchange-alt',
                () => this.emitInvoke('SwitchTheme')
            ),
            new SettingsRow(
                'Other',
                'Switch card display type',
                'Switch between expanded or collapsed cards.',
                async () => {
                    return this.settings.getContext().global.expandedCards
                        ? 'Current: expanded'
                        : 'Current: collapsed (default)';
                },
                'fa-exchange-alt',
                () => this.emitInvoke('SwitchCard')
            ),
            new SettingsRow(
                'Other',
                'Refresh online mod list',
                'Check for any new mod releases.',
                async () => {
                        if (this.$store.state.tsMods.isThunderstoreModListUpdateInProgress) {
                            return this.$store.state.tsMods.thunderstoreModListUpdateStatus || "Refreshing...";
                        }
                        if (this.$store.state.tsMods.thunderstoreModListUpdateError) {
                            return `Error refreshing the mod list: ${this.$store.state.tsMods.thunderstoreModListUpdateError.message}`;
                        }
                        if (this.$store.getters['download/activeDownloadCount'] > 0) {
                            return "Refreshing the mod list is disabled while there are active downloads.";
                        }
                        if (this.$store.state.tsMods.modsLastUpdated !== undefined) {
                            return "Cache date: " + moment(this.$store.state.tsMods.modsLastUpdated).format("MMMM Do YYYY, h:mm:ss a");
                        }
                        return "No API information available";
                    },
                'fa-exchange-alt',
                async () => await this.$store.dispatch("tsMods/syncPackageList")
            ),
            new SettingsRow(
              'Other',
              'Change game',
              'Change the current game',
              async () => "",
                'fa-gamepad',
                async () => {
                    await ManagerSettings.resetDefaults();
                    await this.$router.push({name: 'index'});
                }
            ),
            new SettingsRow(
                'Modpacks',
                'Show dependency strings',
                'View a list of installed mods with their version strings. Used inside the dependencies array inside the manifest.json file.',
                async () => `Show dependency strings for ${this.localModList.length} mod(s)`,
                'fa-file-alt',
                () => this.emitInvoke('ShowDependencyStrings')
            ),
        ];

        @Watch('search')
        onSearchChange() {
            this.searchableSettings = this.settingsList
                .filter(value =>
                    value.action.toLowerCase().indexOf(this.search.toLowerCase()) >= 0
                    || value.description.toLowerCase().indexOf(this.search.toLowerCase()) >= 0);
        }

        getFilteredSettings(): Array<SettingsRow> {
            return this.searchableSettings.filter(value => value.group.toLowerCase() === this.activeTab.toLowerCase())
                .sort((a, b) => a.action.localeCompare(b.action));
        }

        async created() {
            if ([StorePlatform.STEAM, StorePlatform.STEAM_DIRECT].includes(this.activeGame.activePlatform.storePlatform)) {
                this.settingsList.push(
                    new SettingsRow(
                        'Locations',
                        'Change Steam folder',
                        `Change the location of the Steam folder that ${this.appName} uses.`,
                        async () => {
                            if (this.settings.getContext().global.steamDirectory !== null) {
                                const directory = await GameDirectoryResolverProvider.instance.getSteamDirectory();
                                if (!(directory instanceof R2Error)) {
                                    return directory;
                                }
                            }
                            return 'Please set manually';
                        },
                        'fa-folder-open',
                        () => this.emitInvoke('ChangeSteamDirectory')
                    ),
                    new SettingsRow(
                        'Debugging',
                        `Reset ${this.activeGame.displayName} installation`,
                        'Fix problems caused by corrupted files or files left over from manual modding attempts.',
                        async () => `This will delete all contents of the ${this.activeGame.steamFolderName} folder, and verify the files through Steam`,
                        'fa-wrench',
                        () => this.emitInvoke('ValidateSteamInstallation')
                    )
                )
            }
            this.settingsList = this.settingsList.sort((a, b) => a.action.localeCompare(b.action));
            this.searchableSettings = this.settingsList;

            const gameDirectory = await GameDirectoryResolverProvider.instance.getDirectory(this.activeGame);
            if (!(gameDirectory instanceof R2Error)) {
                await this.settings.setGameDirectory(gameDirectory);
            }

            const steamDirectory = await GameDirectoryResolverProvider.instance.getSteamDirectory();
            if (!(steamDirectory instanceof R2Error)) {
                await this.settings.setSteamDirectory(steamDirectory);
            }
        }

        changeTab(tab: string) {
            this.activeTab = tab;
        }

        emitInvoke(invoked: string) {
            this.$emit('setting-invoked', invoked);
        }

        doesLogFileExist() {
            return this.logOutput.exists ? 'Log file exists' : 'Log file does not exist';
        }
    }
</script>

<style lang="scss" scoped>
#settings-view {
    width: 100%;
}
</style>
