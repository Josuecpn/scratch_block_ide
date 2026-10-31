<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useWorkspaceStore } from './stores/workspace.store';
import HubLauncherView from './views/HubLauncherView.vue';
import IdeWorkspaceView from './views/IdeWorkspaceView.vue';

const workspaceStore = useWorkspaceStore();
const { activeScreen } = storeToRefs(workspaceStore);
</script>

<template>
  <HubLauncherView v-if="activeScreen === 'hub'" />
  <IdeWorkspaceView v-else />
</template>
