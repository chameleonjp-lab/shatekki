import { createApp } from './app';
import { loadBuildBundle } from './app/bundle';

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');
void loadBuildBundle().then((bundle) => createApp(root, window, bundle));
