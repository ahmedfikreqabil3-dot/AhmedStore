import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['test/*.test.ts'],fileParallelism:false,maxWorkers:1,pool:'forks',testTimeout:60000,hookTimeout:60000}});
