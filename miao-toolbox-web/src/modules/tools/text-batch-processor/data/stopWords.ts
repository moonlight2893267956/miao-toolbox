/** 停用词表（FR-6.6 / UX-DR27）：中英文常用停用词，用于词频过滤 */

export const STOP_WORDS_EN: string[] = [
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when',
  'for', 'to', 'of', 'in', 'on', 'at', 'by', 'with', 'from', 'as',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'this', 'that', 'these', 'those', 'it', 'its',
  'i', 'you', 'he', 'she', 'we', 'they', 'them', 'his', 'her',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'can', 'could',
  'not', 'no', 'yes', 'so', 'very', 'just', 'about', 'up', 'down', 'out',
];

export const STOP_WORDS_ZH: string[] = [
  '的', '了', '和', '是', '在', '我', '有', '人', '就', '都',
  '一', '一个', '不', '也', '很', '到', '说', '要', '去', '你',
  '会', '着', '没有', '看', '好', '自己', '这', '那', '它', '们',
  '吗', '呢', '啊', '吧', '被', '把', '让', '向', '从', '对',
];

export const STOP_WORDS: string[] = [...STOP_WORDS_EN, ...STOP_WORDS_ZH];
