import {documentSettingsSchema} from '@ahmed-store/contracts';import {readJson} from './store-api.js';
export async function loadPrintSettings(){return documentSettingsSchema.parse(await readJson('/documents/settings'));}
