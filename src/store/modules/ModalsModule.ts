import ManifestV2 from "../../model/ManifestV2";
import ThunderstoreMod from "../../model/ThunderstoreMod";

interface State {
    associatedModsModalMod: ManifestV2 | null;
    disableModModalMod: ManifestV2 | null;
    downloadModModalMod: ThunderstoreMod | null;
    isAssociatedModsModOpen: boolean;
    isCategoryFilterModalOpen: boolean;
    isOnlineSortModalOpen: boolean;
    isCreateProfileModalOpen: boolean;
    isDeleteProfileModalOpen: boolean;
    isDisableModModalOpen: boolean;
    isDownloadModModalOpen: boolean;
    isGameRunningModalOpen: boolean;
    isImportProfileModalOpen: boolean;
    isRenameProfileModalOpen: boolean;
    isUninstallModModalOpen: boolean;
    uninstallModModalMod: ManifestV2 | null;
    isProfileManagementModalOpen: boolean;
    isProfileCodeExportModalOpen: boolean;
    isLocalFileImportModalOpen: boolean;
}

export default {
    state: (): State => ({
        associatedModsModalMod: null,
        disableModModalMod: null,
        downloadModModalMod: null,
        isAssociatedModsModOpen: false,
        isCategoryFilterModalOpen: false,
        isOnlineSortModalOpen: false,
        isCreateProfileModalOpen: false,
        isDeleteProfileModalOpen: false,
        isDisableModModalOpen: false,
        isDownloadModModalOpen: false,
        isGameRunningModalOpen: false,
        isImportProfileModalOpen: false,
        isRenameProfileModalOpen: false,
        isUninstallModModalOpen: false,
        uninstallModModalMod: null,
        isProfileManagementModalOpen: false,
        isProfileCodeExportModalOpen: false,
        isLocalFileImportModalOpen: false,
    }),

    mutations: {
        closeAssociatedModsModal: function(state: State): void {
            state.isAssociatedModsModOpen = false;
            state.associatedModsModalMod = null;
        },

        closeCategoryFilterModal: function(state: State): void {
            state.isCategoryFilterModalOpen = false;
        },

        closeOnlineSortModal: function(state: State): void {
            state.isOnlineSortModalOpen = false;
        },

        closeCreateProfileModal: function(state: State): void {
            state.isCreateProfileModalOpen = false;
        },

        closeDeleteProfileModal: function(state: State): void {
            state.isDeleteProfileModalOpen = false;
        },

        closeDisableModModal: function(state: State): void {
            state.isDisableModModalOpen = false;
            state.disableModModalMod = null;
        },

        closeDownloadModModal: function(state: State): void {
            state.isDownloadModModalOpen = false;
            state.downloadModModalMod = null;
        },

        closeGameRunningModal: function(state: State): void {
            state.isGameRunningModalOpen = false;
        },

        closeImportProfileModal: function(state: State): void {
            state.isImportProfileModalOpen = false;
        },

        closeRenameProfileModal: function(state: State): void {
            state.isRenameProfileModalOpen = false;
        },

        closeUninstallModModal: function(state: State): void {
            state.isUninstallModModalOpen = false;
            state.uninstallModModalMod = null;
        },

        closeProfileManagementModal: function(state: State): void {
            state.isProfileManagementModalOpen = false;
        },

        closeProfileCodeExportModal: function(state: State): void {
            state.isProfileCodeExportModalOpen = false;
        },

        closeLocalFileImportModal: function(state: State): void {
            state.isLocalFileImportModalOpen = false;
        },

        openAssociatedModsModal: function(state: State, mod: ManifestV2): void {
            state.associatedModsModalMod = mod;
            state.isAssociatedModsModOpen = true;
        },

        openCategoryFilterModal: function(state: State): void {
            state.isCategoryFilterModalOpen = true;
        },

        openOnlineSortModal: function(state: State): void {
            state.isOnlineSortModalOpen = true;
        },

        openCreateProfileModal: function(state: State): void {
            state.isCreateProfileModalOpen = true;
        },

        openDeleteProfileModal: function(state: State): void {
            state.isDeleteProfileModalOpen = true;
        },

        openDisableModModal: function(state: State, mod: ManifestV2): void {
            state.disableModModalMod = mod;
            state.isDisableModModalOpen = true;
        },

        openDownloadModModal: function(state: State, mod: ThunderstoreMod): void {
            state.downloadModModalMod = mod;
            state.isDownloadModModalOpen = true;
        },

        openGameRunningModal: function(state: State): void {
            state.isGameRunningModalOpen = true;
        },

        openImportProfileModal: function(state: State): void {
            state.isImportProfileModalOpen = true;
        },

        openRenameProfileModal: function(state: State): void {
            state.isRenameProfileModalOpen = true;
        },

        openUninstallModModal: function(state: State, mod: ManifestV2): void {
            state.uninstallModModalMod = mod;
            state.isUninstallModModalOpen = true;
        },

        openUpdateAllModsModal: function(state: State): void {
            state.downloadModModalMod = null;
            state.isDownloadModModalOpen = true;
        },

        openProfileManagementModal: function(state: State): void {
            state.isProfileManagementModalOpen = true;
        },

        openProfileCodeExportModal: function(state: State): void {
            state.isProfileCodeExportModalOpen = true;
        },

        openLocalFileImportModal: function(state: State): void {
            state.isLocalFileImportModalOpen = true;
        },
    }
}
