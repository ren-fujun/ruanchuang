// Conversation history stays intact for audit; only retrieval focus is reset.
export function consultationFocus(turns) {
  let focused = []
  for (const text of turns) {
    const correction = text.match(/不是[^，,；;]+[，,；;]\s*(?:而)?是(.+)/)
    const switchTopic = text.match(/(?:改问|换个话题[，,:：]?|算了[，,]\s*问)(.+)/)
    if (correction) focused = [correction[1]]
    else if (switchTopic) focused = [switchTopic[1]]
    else focused.push(text)
  }
  return focused.join('；')
}
export function requestsHuman(text) {
  return !/(不要|不想|不用|不需要).{0,3}(转人工|找人工|转辅导员)/.test(text) &&
    /(找人工|转人工|转(?:给)?辅导员|联系(?:一下)?辅导员)/.test(text)
}
export function immediateDanger(text) {
  return text.split(/[。！？；\n]/).some(part => {
    const match=part.match(/(?:插座|插排|电线).{0,8}?(?:冒火花|火花|起火|着火|冒烟)|浓烟|呼吸困难/)
    if (!match) return false
    const before=part.slice(Math.max(0,match.index-5),match.index)
    return !/(没有|并无|不是|未见)\s*$/.test(before) && !/(没有|并无|不是|未见)\s*(?:冒火花|火花|起火|着火|冒烟)/.test(match[0])
  })
}
