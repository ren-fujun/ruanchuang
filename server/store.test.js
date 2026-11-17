import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import path from 'node:path'
import os from 'node:os'

test('invalid data is preserved and startup fails', () => {
 const dir=mkdtempSync(path.join(os.tmpdir(),'zh-store-check-'))
 try {
  const file=path.join(dir,'store.json'), broken='{bad json'
  writeFileSync(file,broken)
  const child=spawnSync(process.execPath,['--input-type=module','-e',"import './server/store.js'"],{env:{...process.env,ZHIHUI_DATA_FILE:file},encoding:'utf8'})
  assert.notEqual(child.status,0)
  assert.equal(readFileSync(file,'utf8'),broken)
 } finally { rmSync(dir,{recursive:true,force:true}) }
})

test('valid JSON with incomplete structure is preserved', () => {
 const dir=mkdtempSync(path.join(os.tmpdir(),'zh-store-check-'))
 try {
  const file=path.join(dir,'store.json'), incomplete='{"tickets":[]}'
  writeFileSync(file,incomplete)
  const child=spawnSync(process.execPath,['--input-type=module','-e',"import './server/store.js'"],{env:{...process.env,ZHIHUI_DATA_FILE:file},encoding:'utf8'})
  assert.notEqual(child.status,0)
  assert.equal(readFileSync(file,'utf8'),incomplete)
 } finally { rmSync(dir,{recursive:true,force:true}) }
})

test('saveNow persists changes across a fresh process', () => {
 const dir=mkdtempSync(path.join(os.tmpdir(),'zh-store-check-'))
 try {
  const file=path.join(dir,'store.json')
  writeFileSync(file,JSON.stringify({users:[],tickets:[]}))
  const env={...process.env,ZHIHUI_DATA_FILE:file}
  const child=spawnSync(process.execPath,['--input-type=module','-e',"import {db,saveNow} from './server/store.js'; db.tickets.push({id:'test'}); saveNow()"],{env,encoding:'utf8'})
  assert.equal(child.status,0,child.stderr)
  const read=spawnSync(process.execPath,['--input-type=module','-e',"import {db} from './server/store.js'; process.stdout.write(db.tickets[0].id)"],{env,encoding:'utf8'})
  assert.equal(read.status,0,read.stderr)
  assert.equal(read.stdout,'test')
 } finally { rmSync(dir,{recursive:true,force:true}) }
})
