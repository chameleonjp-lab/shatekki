import { createApp } from './app';
import { loadBuildSetup } from './app/bundle';

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');
void loadBuildSetup().then(({ bundle, expandedUi }) => createApp(root, window, bundle, expandedUi));
