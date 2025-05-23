<script lang="ts">
import { Vue, Component } from 'vue-property-decorator';
import { ModalCard } from '../../all';
import R2Error from '../../../model/errors/R2Error';
import ManifestV2 from '../../../model/ManifestV2';
import Dependants from '../../../r2mm/mods/Dependants';

@Component({
    components: {ModalCard}
})
export default class AssociatedModsModal extends Vue {

    get dependants(): Set<ManifestV2> {
        return Dependants.getDependantList(this.mod, this.$store.state.profile.modList);
    }

    get dependencies(): Set<ManifestV2> {
        return Dependants.getDependencyList(this.mod, this.$store.state.profile.modList);
    }

    get isOpen(): boolean {
        return this.$store.state.modals.isAssociatedModsModOpen
            && this.$store.state.modals.associatedModsModalMod !== null;
    }

    get mod(): ManifestV2 {
        if (this.$store.state.modals.associatedModsModalMod === null) {
            throw new R2Error(
                'Error while opening AssociatedModsModal',
                'Mod not provided'
            );
        }
        return this.$store.state.modals.associatedModsModalMod;
    }

    onClose() {
        this.$store.commit('closeAssociatedModsModal');
    }
}
</script>
<template>
    <ModalCard id="associated-mods-modal" v-if="isOpen" :is-active="true" @close-modal="onClose">
        <template v-slot:header>
            <h2 class='modal-title'>Mods associated with {{mod.getName()}}</h2>
        </template>
        <template v-slot:body>
            <div v-if="!!dependencies.size">
                <h3 class="subtitle is-5">Dependencies</h3>
                <ul class="list">
                    <li class="list-item" v-for='(mod) in dependencies'
                        :key='`dependency-${mod.getName()}`'>
                        {{mod.getName()}}
                    </li>
                </ul>
            </div>
            <br v-if="!!dependencies.size"/>
            <div v-if="!!dependants.size">
                <h3 class="subtitle is-5">Dependants</h3>
                <ul class="list">
                    <li class="list-item" v-for='(mod) in dependants'
                        :key='`dependant-${mod.getName()}`'>
                        {{mod.getName()}}
                    </li>
                </ul>
            </div>
            <div v-if="dependencies.size === 0 && dependants.size === 0">
                <p>This mod has no dependencies or dependants.</p>
            </div>
        </template>
        <template v-slot:footer>
            <button class="button is-info" @click="onClose">
                Done
            </button>
        </template>
    </ModalCard>
</template>

<style scoped lang="scss">

</style>
