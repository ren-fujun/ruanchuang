import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const repo=fileURLToPath(new URL('../../',import.meta.url))
export default function portal(id,port){return defineConfig({root:path.join(repo,'apps',id),cacheDir:path.join(repo,'node_modules','.vite-portals',id),plugins:[react()],publicDir:path.join(repo,'public'),server:{host:'127.0.0.1',port,strictPort:true,fs:{allow:[repo]},proxy:{'/api':{target:process.env.PORTAL_API_URL||'http://127.0.0.1:8787',changeOrigin:true}}},build:{outDir:path.join(repo,'dist-portals',id),emptyOutDir:true}})}
