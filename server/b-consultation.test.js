import test from 'node:test'
import assert from 'node:assert/strict'
import {consultationFocus,requestsHuman,immediateDanger} from './b/consultation.js'
test('corrections reset retrieval without changing original turns',()=>{
 const turns=['补办校园卡','不是校园卡，是银行卡']
 assert.equal(consultationFocus(turns),'银行卡');assert.equal(turns.length,2)
 assert.equal(consultationFocus(['我想问助学金','改问校园卡补办']),'校园卡补办')
 assert.equal(consultationFocus(['宿舍有问题','卫生间漏水']),'宿舍有问题；卫生间漏水')
})
test('explicit handoff and immediate dangers have narrow negative controls',()=>{
 assert.equal(requestsHuman('请把问题转给辅导员'),true)
 assert.equal(requestsHuman('说了三次，找人工'),true)
 assert.equal(requestsHuman('不要转人工'),false)
 for(const text of ['宿舍插座冒火花','宿舍有浓烟和焦味','吃坏肚子而且呼吸困难'])assert.equal(immediateDanger(text),true)
 assert.equal(immediateDanger('现场没有浓烟'),false)
 assert.equal(immediateDanger('空调不制冷'),false)
})
