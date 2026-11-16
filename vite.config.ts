import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {defineConfig,type Plugin} from 'vite';
import react from '@vitejs/plugin-react';
import {cloudflare} from '@cloudflare/vite-plugin';

/**
 * #41: stamps public/sw.js with an id derived from what this build ships (index.html → hashed assets, and the worker itself).
 * A deploy that changes the app therefore changes sw.js byte-for-byte, so installed PWAs find a new worker and can offer
 * «تحديث الآن»; a redeploy of identical files keeps the same id and shows no prompt.
 */
function wordloopBuildId():Plugin{
  return {
    name:'wordloop-build-id',apply:'build',
    writeBundle(options){
      const dir=options.dir;if(!dir)return;
      const sw=join(dir,'sw.js'),html=join(dir,'index.html');
      if(!existsSync(sw)||!existsSync(html))return;
      const source=readFileSync(sw,'utf8');
      const id=createHash('sha256').update(readFileSync(html)).update(source).digest('hex').slice(0,12);
      writeFileSync(sw,source.replaceAll('__WL_BUILD__',id));
    },
  };
}

export default defineConfig({
  plugins:[react(),cloudflare({viteEnvironment:{name:'worker'}}),wordloopBuildId()],
  environments:{worker:{build:{sourcemap:true}}},
});
