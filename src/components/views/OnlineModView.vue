<template>
    <div class="split-pane" :class="[{'split-pane--with-active-second-pane': previewMod !== null}]">
        <div id="online-view">
            <div id="controls">
                <div class="inherit-background-colour non-selectable">
                    <div class="is-shadowless is-square">
                        <div class="no-padding-left card-header-title">
                            <div class="input-group input-group--flex margin-right">
                                <label for="thunderstore-search-filter">Search</label>
                                <DeferredInput
                                    v-model="thunderstoreSearchFilter"
                                    id="thunderstore-search-filter"
                                    class="input"
                                    type="text"
                                    placeholder="Search"
                                    autocomplete="off"
                                />
                            </div>
                            <div class="input-group">
                                <div class="input-group input-group--flex">
                                    <label for="thunderstore-category-filter">&nbsp;</label>
                                    <button
                                        id="thunderstore-category-filter"
                                        class="button"
                                        @click="$store.commit('openOnlineSortModal')"
                                    >
                                        Sort
                                    </button>
                                </div>
                            </div>
                            &nbsp;
                            <div class="input-group">
                                <div class="input-group input-group--flex">
                                    <label for="thunderstore-category-filter">&nbsp;</label>
                                    <button
                                        id="thunderstore-category-filter"
                                        class="button"
                                        @click="$store.commit('openCategoryFilterModal')"
                                    >
                                        Filter
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <ModListUpdateBanner />
            <div id="view-content">
                <OnlineModList
                    :local-mod-list="localModList"
                    :paged-mod-list="pagedThunderstoreModList"
                    :selected-mod="previewMod"
                    @selected-mod="toggleModPreview"
                />
                <div class="in-mod-list" v-if="getPaginationSize() > 1">
                    <p class="notification margin-right">
                        Use the numbers below to change page
                    </p>
                </div>
                <div class="in-mod-list" v-else-if="getPaginationSize() === 0">
                    <p class="notification margin-right">
                        {{thunderstoreModList.length ? "No mods matching search found": "No mods available"}}
                    </p>
                </div>
            </div>
            <div id="pagination">
                <PaginationButtons
                    :current-page="pageNumber"
                    :page-count="getPaginationSize()"
                    :context-size="3"
                    :on-click="updatePageNumber"
                />
            </div>
        </div>
        <div id="mod-preview">
            <template v-if="previewMod !== null">
                <OnlinePreviewPanel :mod="previewMod"/>
            </template>
        </div>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component';
import { Vue, Watch } from 'vue-property-decorator';
import SortingDirection from '../../model/enums/SortingDirection';
import SortingStyle from '../../model/enums/SortingStyle';
import ManifestV2 from '../../model/ManifestV2';
import ThunderstoreMod from '../../model/ThunderstoreMod';
import OnlineModListProvider from '../../providers/components/loaders/OnlineModListProvider';
import SearchUtils from '../../utils/SearchUtils';
import PaginationButtons from "../navigation/PaginationButtons.vue";
import { DeferredInput } from "../all";
import ModListUpdateBanner from "../ModListUpdateBanner.vue";
import OnlinePreviewPanel from '../v2/OnlinePreviewPanel.vue';
import OnlineModListWithPanel from '../views/OnlineModListWithPanel.vue';

@Component({
    components: {
        OnlineModListWithPanel,
        OnlinePreviewPanel,
        DeferredInput,
        ModListUpdateBanner,
        OnlineModList: OnlineModListProvider.provider,
        PaginationButtons,
    }
})

export default class OnlineModView extends Vue {
    readonly pageSize = 40;
    pagedThunderstoreModList: ThunderstoreMod[] = [];
    pageNumber = 1;
    searchableThunderstoreModList: ThunderstoreMod[] = [];
    sortedThunderstoreModList: ThunderstoreMod[] = [];
    thunderstoreSearchFilter = "";
    previewMod: ThunderstoreMod | null = null;

    get localModList(): ManifestV2[] {
        return this.$store.state.profile.modList;
    }

    get thunderstoreModList(): ThunderstoreMod[] {
        return this.$store.state.tsMods.mods;
    }

    getPaginationSize() {
        return Math.ceil(this.searchableThunderstoreModList.length / this.pageSize);
    }

    @Watch("pageNumber")
    changePage() {
        this.pagedThunderstoreModList = this.searchableThunderstoreModList.slice(
            (this.pageNumber - 1) * this.pageSize,
            this.pageNumber * this.pageSize
        );
    }

    @Watch("thunderstoreSearchFilter")
    performThunderstoreFilterUpdate() {
        this.pageNumber = 1;
        this.filterThunderstoreModList();
    }

    @Watch("$store.state.modFilters.allowNsfw")
    @Watch("$store.state.modFilters.selectedCategoriesCompareOne")
    @Watch("$store.state.modFilters.selectedCategoriesCompareAll")
    @Watch("$store.state.modFilters.selectedCategoriesToExclude")
    @Watch("$store.state.modFilters.showDeprecatedPackages")
    filterThunderstoreModList() {
        const allowNsfw = this.$store.state.modFilters.allowNsfw;
        const filterCategoriesToCompareOne = this.$store.state.modFilters.selectedCategoriesCompareOne;
        const filterCategoriesToCompareAll = this.$store.state.modFilters.selectedCategoriesCompareAll;
        const filterCategoriesToExclude = this.$store.state.modFilters.selectedCategoriesToExclude;
        const showDeprecatedPackages = this.$store.state.modFilters.showDeprecatedPackages;

        let searchableList = this.sortedThunderstoreModList;
        const searchKeys = SearchUtils.makeKeys(this.thunderstoreSearchFilter);
        if (searchKeys.length > 0) {
            searchableList = this.sortedThunderstoreModList.filter((x: ThunderstoreMod) => {
                return SearchUtils.isSearched(searchKeys, x.getFullName(), x.getDescription())
            });
        }
        if (!allowNsfw) {
            searchableList = searchableList.filter(mod => !mod.getNsfwFlag());
        }
        if (!showDeprecatedPackages) {
            searchableList = searchableList.filter(
                mod => !this.$store.state.tsMods.deprecated.get(mod.getFullName())
            );
        }

        // Category filters
        if (filterCategoriesToExclude.length > 0) {
            searchableList = searchableList.filter((x: ThunderstoreMod) =>
                !filterCategoriesToExclude.some((category: string) => x.getCategories().includes(category)))
        }
        if (filterCategoriesToCompareOne.length > 0) {
            searchableList = searchableList.filter((x: ThunderstoreMod) =>
                filterCategoriesToCompareOne.some((category: string) => x.getCategories().includes(category)))
        }
        if (filterCategoriesToCompareAll.length > 0) {
            searchableList = searchableList.filter((x: ThunderstoreMod) =>
                filterCategoriesToCompareAll.every((category: string) => x.getCategories().includes(category)))
        }

        this.searchableThunderstoreModList = [...searchableList];

        // Update results
        this.changePage();
    }

    @Watch("$store.state.modFilters.sortDirection")
    @Watch("$store.state.modFilters.sortBehaviour")
    @Watch("thunderstoreModList")
    sortThunderstoreModList() {
        const sortDescending = this.$store.state.modFilters.sortDirection == SortingDirection.STANDARD;
        const sortedList = [...this.thunderstoreModList];
        sortedList.sort((a: ThunderstoreMod, b: ThunderstoreMod) => {
            let result: boolean;
            switch (this.$store.state.modFilters.sortBehaviour) {
                case SortingStyle.LAST_UPDATED:
                    result = a.getDateUpdated() < b.getDateUpdated();
                    break;
                case SortingStyle.ALPHABETICAL:
                    result = a.getName().localeCompare(b.getName()) > 0;
                    break;
                case SortingStyle.DOWNLOADS:
                    result = a.getDownloadCount() < b.getDownloadCount();
                    break;
                case SortingStyle.RATING:
                    result = a.getRating() < b.getRating();
                    break;
                case SortingStyle.DEFAULT:
                    result = true;
                    break;
                default:
                    result = true;
                    break;
            }
            const sortOrder = result ? 1 : -1;
            return sortDescending ? sortOrder : -sortOrder;
        });
        this.sortedThunderstoreModList = sortedList;
        this.filterThunderstoreModList();
    }

    updatePageNumber(page: number) {
        this.pageNumber = page;
        window.scrollTo({
            top: 0,
            left: 0,
            behavior: "auto"
        });
    }

    toggleModPreview(mod: ThunderstoreMod) {
        if (this.previewMod === mod) {
            this.previewMod = null;
        } else {
            this.previewMod = mod;
        }
    }

    async created() {
        this.sortThunderstoreModList();
    }
};
</script>

<style lang="scss" scoped>
#online-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow-x: hidden;

    #controls {
        flex: 0;
    }

    #pagination {
        flex: 0;
    }

    #view-content {
        flex-grow: 1;
        overflow-y: auto;
        padding-right: 1rem;
        height: 100%;
    }
}

#mod-preview {
    flex: 0;
    display: none;
}

.split-pane {
    display: flex;
    overflow-y: hidden;
    max-height: 100%;
    width: 100%;
    flex: 1;

    &--with-active-second-pane {
        #mod-preview {
            display: flex;
            flex: 0;
        }
    }
}
</style>
