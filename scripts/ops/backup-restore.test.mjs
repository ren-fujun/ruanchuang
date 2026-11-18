import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

test('isolated backup restores data and preserves the pre-restore snapshot',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'zhihui-ops-test-'))
  try {
    const file=path.join(dir,'store.json'), backups=path.join(dir,'backups')
    const env={...process.env,ZHIHUI_DATA_FILE:file,ZHIHUI_BACKUP_DIR:backups}
    const before={users:[{id:'fictional'}],tickets:[{id:'original'}]}
    await writeFile(file,JSON.stringify(before))
    const run=(...args)=>spawnSync(process.execPath,args,{env,encoding:'utf8'})
    assert.equal(run('scripts/ops/backup.mjs').status,0)
    const names=await readdir(backups);assert.equal(names.length,1)
    const backup=path.join(backups,names[0])
    assert.deepEqual(JSON.parse(await readFile(backup,'utf8')),before)
    const changed={users:[],tickets:[{id:'changed'}]};await writeFile(file,JSON.stringify(changed))
    assert.notEqual(run('scripts/ops/restore.mjs',backup).status,0)
    assert.deepEqual(JSON.parse(await readFile(file,'utf8')),changed)
    assert.equal(run('scripts/ops/restore.mjs',backup,'--yes').status,0)
    assert.deepEqual(JSON.parse(await readFile(file,'utf8')),before)
    const saved=(await readdir(dir)).find(name=>name.startsWith('store.json.pre-restore-'))
    assert.ok(saved);assert.deepEqual(JSON.parse(await readFile(path.join(dir,saved),'utf8')),changed)
    await writeFile(file,'{"users":[]}')
    assert.notEqual(run('scripts/ops/backup.mjs').status,0)
  } finally {await rm(dir,{recursive:true,force:true})}
})
