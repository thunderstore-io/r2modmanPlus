import ProfileInstallerProvider from '../../../providers/ror2/installing/ProfileInstallerProvider';
import ManifestV2 from '../../../model/ManifestV2';
import Profile from '../../../model/Profile';
import FileTree from '../../../model/file/FileTree';
import R2Error from '../../../model/errors/R2Error';
import ModLoaderPackageMapping from '../../../model/installing/ModLoaderPackageMapping';
import path from 'path';
import FsProvider from '../../../providers/generic/file/FsProvider';
import ModFileTracker from '../../../model/installing/ModFileTracker';
import yaml from 'yaml';
import ConflictManagementProvider from '../../../providers/generic/installing/ConflictManagementProvider';
import ModMode from '../../../model/enums/ModMode';
import InstallationRules, { CoreRuleType, ManagedRule, RuleSubtype } from '../../installing/InstallationRules';
import PathResolver from '../../../r2mm/manager/PathResolver';
import GameManager from '../../../model/game/GameManager';
import { MOD_LOADER_VARIANTS } from '../../installing/profile_installers/ModLoaderVariantRecord';
import FileWriteError from '../../../model/errors/FileWriteError';
import FileUtils from '../../../utils/FileUtils';
import { GetInstallerIdForLoader } from '../../../model/installing/PackageLoader';
import ZipProvider from "../../../providers/generic/zip/ZipProvider";
import { PackageInstallers } from "../../../installers/registry";
import { InstallArgs } from "../../../installers/PackageInstaller";
import { InstallRuleInstaller } from "../../../installers/InstallRuleInstaller";


export default class GenericProfileInstaller extends ProfileInstallerProvider {

    private readonly rule: CoreRuleType;
    private readonly legacyInstaller: InstallRuleInstaller;

    constructor() {
        super();
        this.rule = InstallationRules.RULES.find(value => value.gameName === GameManager.activeGame.internalFolderName)!;
        this.legacyInstaller = new InstallRuleInstaller(this.rule);
    }

    private async applyModModeForSubdir(mod: ManifestV2, tree: FileTree, profile: Profile, location: string, mode: number): Promise<R2Error | void> {
        const subDirPaths = InstallationRules.getAllManagedPaths(this.rule.rules)
            .filter(value => value.trackingMethod === "SUBDIR");
        for (const dir of subDirPaths) {
            if (await FsProvider.instance.exists(path.join(profile.getPathOfProfile(), dir.route))) {
                const dirContents = await FsProvider.instance.readdir(path.join(profile.getPathOfProfile(), dir.route));
                for (const namespacedDir of dirContents) {
                    if (namespacedDir === mod.getName()) {
                        const tree = await FileTree.buildFromLocation(path.join(profile.getPathOfProfile(), dir.route, namespacedDir));
                        if (tree instanceof R2Error) {
                            return tree;
                        }
                        for (const value of tree.getRecursiveFiles()) {
                            if (mode === ModMode.DISABLED && mod.isEnabled()) {
                                await FsProvider.instance.rename(value, `${value}.old`);
                            } else if (mode === ModMode.ENABLED && !mod.isEnabled()) {
                                if (value.toLowerCase().endsWith(".old")) {
                                    await FsProvider.instance.rename(value, value.substring(0, value.length - ('.old').length));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private async applyModModeForState(mod: ManifestV2, tree: FileTree, profile: Profile, location: string, mode: number): Promise<R2Error | void> {
        try {
            const modStateFilePath = path.join(location, "_state", `${mod.getName()}-state.yml`);
            if (await FsProvider.instance.exists(modStateFilePath)) {
                const fileContents = (await FsProvider.instance.readFile(modStateFilePath)).toString();
                const tracker: ModFileTracker = yaml.parse(fileContents);
                for (const [key, value] of tracker.files) {
                    if (await ConflictManagementProvider.instance.isFileActive(mod, profile, value)) {
                        if (mode === ModMode.DISABLED) {
                            if (await FsProvider.instance.exists(path.join(location, value))) {
                                await FsProvider.instance.unlink(path.join(location, value));
                            }
                        } else {
                            if (await FsProvider.instance.exists(path.join(location, value))) {
                                await FsProvider.instance.unlink(path.join(location, value));
                            }
                            await FsProvider.instance.copyFile(key, path.join(location, value));
                        }
                    }
                }
            }
        } catch (e) {
            if (e instanceof R2Error) {
                return e;
            } else {
                // @ts-ignore
                const err: Error = e;
                return new R2Error(`Error installing mod: ${mod.getName()}`, err.message, null);
            }
        }
    }

    async applyModMode(mod: ManifestV2, tree: FileTree, profile: Profile, location: string, mode: number): Promise<R2Error | void> {
        const appliedState = await this.applyModModeForState(mod, tree, profile, location, mode);
        if (appliedState instanceof R2Error) {
            return appliedState;
        }
        const appliedSub = await this.applyModModeForSubdir(mod, tree, profile, location, mode);
        if (appliedSub instanceof R2Error) {
            return appliedSub;
        }
    }

    async disableMod(mod: ManifestV2, profile: Profile): Promise<R2Error | void> {
        return this.applyModMode(mod, new FileTree(), profile, profile.getPathOfProfile(), ModMode.DISABLED);
    }

    async enableMod(mod: ManifestV2, profile: Profile): Promise<R2Error | void> {
        return this.applyModMode(mod, new FileTree(), profile, profile.getPathOfProfile(), ModMode.ENABLED);
    }

    async getDescendantFiles(tree: FileTree | null, location: string): Promise<string[]> {
        const files: string[] = [];
        if (tree === null) {
            const newTree = await FileTree.buildFromLocation(location);
            if (newTree instanceof R2Error) {
                return files;
            }
            tree = newTree;
        }
        for (const directory of tree.getDirectories()) {
            files.push(...(await this.getDescendantFiles(directory, path.join(location, directory.getDirectoryName()))));
        }
        tree.getFiles().forEach((file: string) => {
            files.push(file);
        })
        return files;
    }

    async installForManifestV2(args: InstallArgs): Promise<R2Error | null> {
        try {
            await this.legacyInstaller.install(args);
            return null;
        } catch (e) {
            return R2Error.fromThrownValue(e);
        }
    }

    async installMod(mod: ManifestV2, profile: Profile): Promise<R2Error | null> {
        const cacheDirectory = path.join(PathResolver.MOD_ROOT, 'cache');
        const cachedLocationOfMod: string = path.join(cacheDirectory, mod.getName(), mod.getVersionNumber().toString());

        const activeGame = GameManager.activeGame;
        const bepInExVariant = MOD_LOADER_VARIANTS[activeGame.internalFolderName];
        const variant = bepInExVariant.find(value => value.packageName.toLowerCase() === mod.getName().toLowerCase());

        const args: InstallArgs = {
            mod: mod,
            profile: profile,
            packagePath: cachedLocationOfMod,
        }

        if (variant !== undefined) {
            return this.installModLoader(variant, args);
        } else {
            return this.installForManifestV2(args);
        }
    }

    async installModLoader(mapping: ModLoaderPackageMapping, args: InstallArgs): Promise<R2Error | null> {
        const installerId = GetInstallerIdForLoader(mapping.loaderType);
        if (installerId) {
            await PackageInstallers[installerId].install(args);
            return Promise.resolve(null);
        } else {
            return new R2Error(
                "Installer not found",
                `Failed to find an appropriate installer for the package ${mapping.packageName}`
            );
        }
    }

    private async uninstallPackageZip(mod: ManifestV2, profile: Profile) {
        const fs = FsProvider.instance;

        const recursiveDelete = async (mainPath: string, match: string) => {
            for (const subpath of (await fs.readdir(mainPath))) {
                const fullSubpath = path.join(mainPath, subpath);
                const subpathInfo = await fs.lstat(fullSubpath);
                if (subpathInfo.isDirectory()) {
                    await recursiveDelete(fullSubpath, match);
                } else if (subpathInfo.isFile() && subpath == match) {
                    await fs.unlink(fullSubpath);
                }
            }
        }

        await recursiveDelete(profile.getPathOfProfile(), `${mod.getName()}.ts.zip`);
    }

    private async uninstallSubDir(mod: ManifestV2, profile: Profile): Promise<R2Error | null> {
        const activeGame = GameManager.activeGame;
        const fs = FsProvider.instance;
        const bepInExVariant = MOD_LOADER_VARIANTS[activeGame.internalFolderName];
        if (bepInExVariant.find(value => value.packageName.toLowerCase() === mod.getName().toLowerCase())) {
            try {
                for (const file of (await fs.readdir(profile.getPathOfProfile()))) {
                    const filePath = path.join(profile.getPathOfProfile(), file);
                    if ((await fs.lstat(filePath)).isFile()) {
                        if (file.toLowerCase() !== 'mods.yml') {
                            await fs.unlink(filePath);
                        }
                    }
                }
            } catch(e) {
                const err: Error = e as Error;
                return new FileWriteError(
                    'Failed to delete BepInEx file from profile root',
                    err.message,
                    'Is the game still running?'
                );
            }
        }
        const bepInExLocation: string = path.join(profile.getPathOfProfile(), 'BepInEx');
        if (await fs.exists(bepInExLocation)) {
            try {
                for (const file of (await fs.readdir(bepInExLocation))) {
                    if ((await fs.lstat(path.join(bepInExLocation, file))).isDirectory()) {
                        for (const folder of (await fs.readdir(path.join(bepInExLocation, file)))) {
                            const folderPath: string = path.join(bepInExLocation, file, folder);
                            if (folder === mod.getName() && (await fs.lstat(folderPath)).isDirectory()) {
                                await FileUtils.emptyDirectory(folderPath);
                                await fs.rmdir(folderPath);
                            }
                        }
                    }
                }
            } catch (e) {
                const err: Error = e as Error;
                return new R2Error(
                    "Failed to remove files",
                    err.message,
                    'Is the game still running? If so, close it and try again.'
                );
            }
        }
        return Promise.resolve(null);
    }

    private async uninstallState(mod: ManifestV2, profile: Profile): Promise<R2Error | null> {
        const fs = FsProvider.instance;
        const profileDir = profile.getPathOfProfile();
        const stateFilePath = path.join(profileDir, "_state", `${mod.getName()}-state.yml`);

        if (!await fs.exists(stateFilePath)) {
            return Promise.resolve(null);
        }

        const read = await fs.readFile(stateFilePath);
        const tracker = (yaml.parse(read.toString()) as ModFileTracker);

        const sortedFileTargets = tracker
            .files
            .map(x => path.join(profileDir, x[1]))
            .sort(x => (x.match("/\\/g") || []).length)
            .reverse();

        for (const installFile of sortedFileTargets) {
            if (!fs.exists(installFile)) {
                continue;
            }

            await fs.unlink(installFile);

            // Remove empty directories, starting at the target file's parent and stopping
            // at the profile directory.
            var iterDir = path.dirname(installFile);

            while (iterDir != profileDir && fs.exists(iterDir)) {
                if ((await fs.readdir(iterDir)).length != 0) {
                    break;
                }

                await fs.rmdir(iterDir);
                iterDir = path.dirname(iterDir);
            }
        }

        await fs.unlink(stateFilePath);
        return Promise.resolve(null);
    }

    async uninstallMod(mod: ManifestV2, profile: Profile): Promise<R2Error | null> {
        const uninstallState = await this.uninstallState(mod, profile);
        if (uninstallState instanceof R2Error) {
            return uninstallState;
        }
        const uninstallSubDir = await this.uninstallSubDir(mod, profile);
        if (uninstallSubDir instanceof R2Error) {
            return uninstallSubDir;
        }
        try {
            await this.uninstallPackageZip(mod, profile);
        } catch (e) {
            return R2Error.fromThrownValue(e, "Failed to remove files");
        }
        return null;
    }
}
