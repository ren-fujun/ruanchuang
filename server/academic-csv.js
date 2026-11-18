const columns=['studentId','course','mentorId','counselorId']
export function parseAcademicCsv(text) {
 if(typeof text!=='string' || !text || Buffer.byteLength(text,'utf8')>1024*1024) throw new Error('CSV不能为空或超过1MB。')
 text=text.replace(/^\uFEFF/,'')
 const records=[]; let row=[], field='', quoted=false, closed=false
 for(let i=0;i<text.length;i++) {
  const ch=text[i]
  if(quoted){ if(ch==='"'){if(text[i+1]==='"'){field+='"';i++}else{quoted=false;closed=true}} else field+=ch; continue }
  if(closed && ch!==',' && ch!=='\r' && ch!=='\n') throw new Error('CSV引号格式有误。')
  if(ch==='"'){if(field!=='' || closed) throw new Error('CSV引号格式有误。');quoted=true;continue}
  if(ch===','){row.push(field);field='';closed=false;continue}
  if(ch==='\r'||ch==='\n'){if(ch==='\r' && text[i+1]==='\n')i++;row.push(field);records.push(row);row=[];field='';closed=false;if(records.length>1001)throw new Error('名单最多1000行。');continue}
  field+=ch
 }
 if(quoted)throw new Error('CSV引号未闭合。')
 if(field!==''||row.length||closed){row.push(field);records.push(row)}
 if(records.length>1001)throw new Error('名单最多1000行。')
 if(!records.length || records[0].length!==columns.length || !columns.every((column,i)=>records[0][i].trim()===column)) throw new Error('表头须依次为 studentId,course,mentorId,counselorId。')
 if(records.length<2)throw new Error('名单不能为空。')
 return records.slice(1).map((cells,index)=>{if(cells.length!==columns.length)throw new Error(`第${index+2}行列数不正确。`);return Object.fromEntries(columns.map((column,i)=>[column,cells[i]]))})
}
