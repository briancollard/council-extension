/**
 * Internationalization (i18n) and localization data.
 *
 * Provides the `translate()` function, language lists, tone/writing style
 * lists, sort-by lists, personality/characteristic lists, backup model
 * definitions, and report reason options.
 *
 * Original source: content.isolated.end.js lines 1599-3310
 */

// ---------------------------------------------------------------------------
// Translation system
// ---------------------------------------------------------------------------

interface TranslationEntry {
  message: string;
}

let translation: Record<string, TranslationEntry> = {};

/**
 * Load translations from the extension's _locales directory.
 * Detects the user's locale from ChatGPT's localStorage key and falls
 * back to English if the locale file is unavailable.
 *
 * Original: `setTranslation` (line 1600)
 */
export async function setTranslation(): Promise<void> {
  const locale = window.localStorage.getItem('oai/apps/locale')?.replace(/['"]+/g, '')?.split('-')[0] || 'en';
  try {
    const res = await fetch(chrome.runtime.getURL(`_locales/${locale}/messages.json`));
    if (res.ok) {
      translation = await res.json();
      return;
    }
  } catch {
    // locale not available, try English fallback
  }
  try {
    const res = await fetch(chrome.runtime.getURL('_locales/en/messages.json'));
    if (res.ok) {
      translation = await res.json();
      return;
    }
  } catch {
    // English fallback also failed
  }
  console.warn('[Council] Could not load locale files, using empty translations');
  translation = {};
}

/**
 * Translate a string using the loaded locale messages.
 * Falls back to the original string if no translation is found.
 *
 * Original: `translate` (line 1609)
 */
export function translate(text: string): string {
  const key = text.toLowerCase().replace(/[- ]/g, '_');
  return translation[key]?.message || text;
}

// ---------------------------------------------------------------------------
// Common types
// ---------------------------------------------------------------------------

export interface CodeNameItem {
  code: string;
  name: string;
  description?: string;
  subtitle?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Sort-by lists
// ---------------------------------------------------------------------------

export const librarySortByList: CodeNameItem[] = [
  { code: 'recent', name: 'New' },
  { code: 'use', name: 'Most Used' },
  { code: 'vote', name: 'Most Votes' },
  { code: 'mine', name: 'My prompts' },
];

export const gizmoSortByList: CodeNameItem[] = [
  { code: 'recent', name: 'Recently updated' },
  { code: 'popular', name: 'Most popular' },
];

export const notesSortByList: CodeNameItem[] = [
  { code: 'alphabetical', name: 'Alphabetical (A\u2192Z)' },
  { code: 'alphabetical-reverse', name: 'Alphabetical (Z\u2192A)' },
  { code: 'created_at', name: 'Create date' },
  { code: 'updated_at', name: 'Update date' },
];

export const promptsSortByList: CodeNameItem[] = [
  { code: 'alphabetical', name: 'Alphabetical (A\u2192Z)' },
  { code: 'alphabetical-reverse', name: 'Alphabetical (Z\u2192A)' },
  { code: 'use', name: 'Most used' },
  { code: 'vote', name: 'Most upvotes' },
  { code: 'created_at', name: 'Create date' },
  { code: 'updated_at', name: 'Update date' },
];

export const conversationsSortByList: CodeNameItem[] = [
  { code: 'alphabetical', name: 'Alphabetical (A\u2192Z)' },
  { code: 'alphabetical-reverse', name: 'Alphabetical (Z\u2192A)' },
  { code: 'created_at', name: 'Create date' },
  { code: 'updated_at', name: 'Update date' },
];

export const profilesSortByList: CodeNameItem[] = [
  { code: 'alphabetical', name: 'Alphabetical (A\u2192Z)' },
  { code: 'alphabetical-reverse', name: 'Alphabetical (Z\u2192A)' },
  { code: 'created_at', name: 'Create date' },
  { code: 'updated_at', name: 'Update date' },
];

// ---------------------------------------------------------------------------
// Tone list
// ---------------------------------------------------------------------------

export const toneList: CodeNameItem[] = [
  { code: 'default', name: 'Default', description: 'No specific tone instruction' },
  {
    code: 'authoritative',
    name: 'Authoritative',
    description:
      'This tone is used to convey expertise or knowledge on a subject. It is characterized by a commanding and confident tone. Example: &quot;As a renowned surgeon with over 20 years of experience, I can assure you that this procedure is safe and effective.&quot;',
  },
  {
    code: 'clinical',
    name: 'Clinical',
    description:
      'This tone is used in technical or medical writing and is characterized by a straightforward, objective, and factual tone. Example: &quot;The results of the study show that the medication reduced symptoms in 75% of patients.&quot;',
  },
  {
    code: 'concise',
    name: 'Concise',
    description:
      'This tone responds with the fewest words & characters possible. It skips extra words & gets right to it. Example: &quot;Data shows sales up 50%,&quot; instead of &quot;Based on the data that we have collected, it appears that there has been an increase in sales by 50%.&quot;',
  },
  {
    code: 'cold',
    name: 'Cold',
    description:
      'This tone is detached, impersonal, and lacking in emotion. Example: &quot;The news of the disaster was reported in a cold and unfeeling manner.&quot;',
  },
  {
    code: 'confident',
    name: 'Confident',
    description:
      'This tone is marked by self-assurance and certainty. Example: &quot;I am confident that with hard work and dedication, we can achieve our goals.&quot;',
  },
  {
    code: 'cynical',
    name: 'Cynical',
    description:
      'This tone is sarcastic and distrustful of human nature. Example: &quot;Oh sure, like that politician really cares about the average person.&quot;',
  },
  {
    code: 'emotional',
    name: 'Emotional',
    description:
      'This tone is characterized by an emphasis on feelings and emotions. Example: &quot;Her heart-wrenching story of survival touched the hearts of many.&quot;',
  },
  {
    code: 'empathetic',
    name: 'Empathetic',
    description:
      'This tone shows understanding and compassion for another person\u2019s perspective or situation. Example: &quot;I understand how difficult this must be for you, and I am here to support you in any way I can.&quot;',
  },
  {
    code: 'formal',
    name: 'Formal',
    description:
      'This tone is used in professional or academic writing and is characterized by a serious and objective tone. Example: &quot;The purpose of this report is to present the findings of our research.&quot;',
  },
  {
    code: 'friendly',
    name: 'Friendly',
    description:
      'This tone is warm, approachable, and welcoming. Example: &quot;Hey there, how\u2019s it going? It\u2019s great to see you again!&quot;',
  },
  {
    code: 'humorous',
    name: 'Humorous',
    description:
      'This tone is light-hearted and amusing, often using wordplay, puns, or jokes. Example: &quot;Why don\u2019t scientists trust atoms? Because they make up everything!&quot;',
  },
  {
    code: 'informal',
    name: 'Informal',
    description:
      'This tone is casual and conversational, often using contractions and colloquial language. Example: &quot;Yo, what\u2019s up? Wanna grab a burger?&quot;',
  },
  {
    code: 'ironic',
    name: 'Ironic',
    description:
      'This tone uses language that expresses the opposite of the intended meaning. Example: &quot;Oh great, another rainy day in paradise.&quot;',
  },
  {
    code: 'optimistic',
    name: 'Optimistic',
    description:
      'This tone is hopeful and positive, expecting the best possible outcome. Example: &quot;Despite the challenges we face, I believe that we can overcome them and create a brighter future.&quot;',
  },
  {
    code: 'pessimistic',
    name: 'Pessimistic',
    description:
      'This tone is negative and expects the worst possible outcome. Example: &quot;I don\u2019t see how we can possibly succeed given the current circumstances.&quot;',
  },
  {
    code: 'persuasive',
    name: 'Persuasive',
    description:
      'This tone is used to convince or influence the reader to take a particular action or adopt a particular viewpoint. It is characterized by the use of rhetorical strategies such as appeals to emotion, logic, and authority. Example: &quot;By choosing to recycle and reduce waste, each one of us has the power to make a meaningful difference for our planet and future generations\u2014let\u2019s take action together today.&quot;',
  },
  {
    code: 'playful',
    name: 'Playful',
    description:
      'This tone is lighthearted and fun, often using playful language and tone. Example: &quot;Come on, don\u2019t be such a party pooper!&quot;',
  },
  {
    code: 'sarcastic',
    name: 'Sarcastic',
    description:
      'This tone is marked by the use of irony and mocking humor. Example: &quot;Oh yeah, that\u2019s a great idea - let\u2019s all jump off a cliff together!&quot;',
  },
  {
    code: 'serious',
    name: 'Serious',
    description:
      'This tone is formal and business-like, often used in professional settings. Example: &quot;I need you to take this matter seriously and provide a detailed report by tomorrow.&quot;',
  },
  {
    code: 'sympathetic',
    name: 'Sympathetic',
    description:
      'This tone is caring and compassionate, showing concern for another person\u2019s feelings. Example: &quot;I\u2019m so sorry to hear about your loss. Please know that I am here for you.&quot;',
  },
  {
    code: 'tentative',
    name: 'Tentative',
    description:
      'This tone is uncertain and hesitant, often used when expressing doubt or asking for permission. Example: &quot;I was wondering if it might be possible to ask for an extension on the deadline?&quot;',
  },
  {
    code: 'warm',
    name: 'Warm',
    description:
      'This tone is friendly, inviting, and creates a sense of closeness or intimacy with the reader. It often uses positive language and expresses appreciation or gratitude. Example: &quot;Thank you so much for your kindness and support. Your encouragement means the world to me and I feel grateful to have you in my life.&quot;',
  },
];

// ---------------------------------------------------------------------------
// Writing style list
// ---------------------------------------------------------------------------

export const writingStyleList: CodeNameItem[] = [
  { code: 'default', name: 'Default', description: 'No specific writing style instruction' },
  {
    code: 'academic',
    name: 'Academic',
    description:
      'This style is used in scholarly writing and emphasizes precision, clarity, and objectivity. It often involves using formal language and adhering to specific citation and formatting guidelines. Example: &quot;In this study, we aim to investigate the impact of climate change on global food security using a combination of statistical analysis and field research.&quot;',
  },
  {
    code: 'analytical',
    name: 'Analytical',
    description:
      'This style is characterized by a focus on breaking down complex ideas into smaller parts and analyzing them in detail. It often involves using logic and evidence to support an argument. Example: &quot;By examining the historical and cultural context of the text, we can gain a deeper understanding of its meaning and significance.&quot;',
  },
  {
    code: 'argumentative',
    name: 'Argumentative',
    description:
      'This style involves presenting a clear and compelling argument on a particular topic, often using evidence and logical reasoning. It aims to persuade the reader to accept a particular viewpoint or opinion. Example: &quot;The evidence clearly shows that implementing stricter gun control measures will reduce the incidence of gun violence in our communities.&quot;',
  },
  {
    code: 'conversational',
    name: 'Conversational',
    description:
      'This style is casual and informal, often using contractions and colloquial language. It is characterized by a friendly, approachable tone and aims to create a sense of connection with the reader. Example: &quot;Hey, have you heard about that new restaurant down the street? I tried it last week and it was amazing!&quot;',
  },
  {
    code: 'creative',
    name: 'Creative',
    description:
      'This style is characterized by a focus on imagination, expression, and originality. It often involves using literary devices such as metaphors, imagery, and symbolism to convey meaning. Example: &quot;The sunset painted the sky with a palette of fiery oranges and deep purples, as if nature itself were an artist at work.&quot;',
  },
  {
    code: 'critical',
    name: 'Critical',
    description:
      'This style involves analyzing and evaluating a particular topic or issue, often with a focus on identifying flaws or weaknesses. It aims to provide a balanced and objective assessment of the subject matter. Example: &quot;Although the company\u2019s financial reports appear to show healthy growth, a closer examination reveals several areas of concern, including high levels of debt and a lack of diversity in revenue streams.&quot;',
  },
  {
    code: 'descriptive',
    name: 'Descriptive',
    description:
      'This style is characterized by a focus on vividly describing a particular object, person, or experience, often using sensory details. It aims to create a clear and immersive picture in the reader\u2019s mind. Example: &quot;The old, weathered barn creaked and groaned in the wind, its paint peeling and roof sagging under the weight of years of neglect.&quot;',
  },
  {
    code: 'epigrammatic',
    name: 'Epigrammatic',
    description:
      'This style involves using short, witty statements or aphorisms to convey a particular message or idea. It often aims to be memorable and thought-provoking. Example: &quot;The only way to do great work is to love what you do.&quot; - Steve Jobs',
  },
  {
    code: 'epistolary',
    name: 'Epistolary',
    description:
      'This style involves using letters or other forms of correspondence to convey a story or message. It often aims to create a sense of intimacy or immediacy with the reader. Example: &quot;Dear John, I can hardly believe it\u2019s been a year since we last spoke. I hope this letter finds you well and that you are enjoying life as much as ever.&quot;',
  },
  {
    code: 'expository',
    name: 'Expository',
    description:
      'This style is characterized by a focus on explaining or informing the reader about a particular topic, often in a clear and concise manner. It aims to provide a comprehensive understanding of the subject matter. Example: &quot;In this essay, we will explore the history and evolution of the internet, from its origins as a military communications network to its current status as a ubiquitous tool for communication and information exchange.&quot;',
  },
  {
    code: 'informative',
    name: 'Informative',
    description:
      'This style aims to provide information on a particular topic or subject, often using a straightforward and objective tone. Example: &quot;This brochure provides an overview of the services offered by our company, including pricing, hours of operation, and contact information.&quot;',
  },
  {
    code: 'instructive',
    name: 'Instructive',
    description:
      'This style is focused on providing guidance or directions on how to perform a specific task or achieve a particular goal. It often involves using a step-by-step approach and clear, concise language. Example: &quot;To make a perfect cup of coffee, start by measuring out the right amount of grounds and heating your water to the proper temperature.&quot;',
  },
  {
    code: 'journalistic',
    name: 'Journalistic',
    description:
      'This style is used in news reporting and aims to provide timely, accurate, and objective information on current events or issues. It often involves using a clear and concise writing style, as well as adhering to established journalistic principles such as objectivity and fairness. Example: &quot;In the wake of the recent political scandal, many are calling for a full investigation into allegations of corruption and misconduct.&quot;',
  },
  {
    code: 'metaphorical',
    name: 'Metaphorical',
    description:
      'This style involves using figurative language and metaphors to convey a particular message or idea. It often aims to create a sense of imagery or evoke a particular emotion in the reader. Example: &quot;Life is a journey, with each step leading us closer to our destination.&quot;',
  },
  {
    code: 'narrative',
    name: 'Narrative',
    description:
      'This style involves telling a story or recounting a particular experience, often using descriptive language and vivid details. It aims to engage the reader and create a sense of suspense or drama. Example: &quot;As I walked through the dark, abandoned alleyway, I could feel my heart pounding in my chest. Suddenly, a figure emerged from the shadows, and I knew I was in trouble.&quot;',
  },
  {
    code: 'persuasive',
    name: 'Persuasive',
    description:
      'This style aims to persuade the reader to accept a particular viewpoint or opinion, often using emotional appeals and logical arguments. It involves using evidence and reasoning to support a particular position. Example: &quot;By implementing renewable energy sources, we can not only reduce our carbon footprint, but also create new jobs and stimulate economic growth.&quot;',
  },
  {
    code: 'poetic',
    name: 'Poetic',
    description:
      'This style is characterized by a focus on language, rhythm, and sound. It often uses literary devices such as metaphor and symbolism to convey meaning and create an emotional impact. Example: &quot;The wind whispered through the trees, its voice a haunting melody that echoed through the night.&quot;',
  },
  {
    code: 'satirical',
    name: 'Satirical',
    description:
      'This style involves using irony, sarcasm, and humor to critique or expose the flaws and shortcomings of a particular subject or idea. It aims to entertain while also making a serious point. Example: &quot;In a shocking display of political posturing, the senator proposed a bill to ban water, citing concerns about its potentially harmful effects on the environment.&quot;',
  },
  {
    code: 'technical',
    name: 'Technical',
    description:
      'This style is used in writing about technical or specialized subjects, such as science or engineering. It often involves using precise and technical language and adhering to established conventions and guidelines. Example: &quot;The results of our experiment were consistent with previous studies, indicating a strong correlation between temperature and pressure in the system.&quot;',
  },
];

// ---------------------------------------------------------------------------
// Language list (190+ languages)
// ---------------------------------------------------------------------------

export const languageList: CodeNameItem[] = [
  { code: 'default', name: 'Default' },
  { code: 'en', name: 'English' },
  { code: 'en-gb', name: 'English (UK)' },
  { code: 'zh', name: 'Chinese' },
  { code: 'hi', name: 'Hindi' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'ar', name: 'Arabic' },
  { code: 'bn', name: 'Bengali (Bangla)' },
  { code: 'ru', name: 'Russian' },
  { code: 'pt-br', name: 'Portuguese (Brazilian)' },
  { code: 'pt-pt', name: 'Portuguese (Portugal)' },
  { code: 'in', name: 'Indonesian' },
  { code: 'ur', name: 'Urdu' },
  { code: 'ja', name: 'Japanese' },
  { code: 'de', name: 'German' },
  { code: 'tr', name: 'Turkish' },
  { code: 'ab', name: 'Abkhazian' },
  { code: 'aa', name: 'Afar' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'ak', name: 'Akan' },
  { code: 'sq', name: 'Albanian' },
  { code: 'gsw', name: 'Alsatian (dialects of German)' },
  { code: 'am', name: 'Amharic' },
  { code: 'an', name: 'Aragonese' },
  { code: 'hy', name: 'Armenian' },
  { code: 'as', name: 'Assamese' },
  { code: 'syr', name: 'Assyrian' },
  { code: 'ast', name: 'Asturian' },
  { code: 'av', name: 'Avaric' },
  { code: 'ae', name: 'Avestan' },
  { code: 'ay', name: 'Aymara' },
  { code: 'az', name: 'Azerbaijani' },
  { code: 'bm', name: 'Bambara' },
  { code: 'ba', name: 'Bashkir' },
  { code: 'eu', name: 'Basque' },
  { code: 'bar', name: 'Bavarian' },
  { code: 'be', name: 'Belarusian' },
  { code: 'bh', name: 'Bihari' },
  { code: 'bi', name: 'Bislama' },
  { code: 'bs', name: 'Bosnian' },
  { code: 'br', name: 'Breton' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'my', name: 'Burmese' },
  { code: 'ca', name: 'Catalan' },
  { code: 'ch', name: 'Chamorro' },
  { code: 'ce', name: 'Chechen' },
  { code: 'ny', name: 'Chichewa, Chewa, Nyanja' },
  { code: 'zh-hans', name: 'Chinese (Simplified)' },
  { code: 'zh-hant', name: 'Chinese (Traditional)' },
  { code: 'cv', name: 'Chuvash' },
  { code: 'kw', name: 'Cornish' },
  { code: 'co', name: 'Corsican' },
  { code: 'cr', name: 'Cree' },
  { code: 'hr', name: 'Croatian' },
  { code: 'cop', name: 'Coptic' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'dv', name: 'Divehi, Dhivehi, Maldivian' },
  { code: 'nl', name: 'Dutch' },
  { code: 'dz', name: 'Dzongkha' },
  { code: 'eo', name: 'Esperanto' },
  { code: 'et', name: 'Estonian' },
  { code: 'ee', name: 'Ewe' },
  { code: 'fo', name: 'Faroese' },
  { code: 'fj', name: 'Fijian' },
  { code: 'fi', name: 'Finnish' },
  { code: 'fur', name: 'Friulian' },
  { code: 'ff', name: 'Fula, Fulah, Pulaar, Pular' },
  { code: 'gl', name: 'Galician' },
  { code: 'gd', name: 'Gaelic (Scottish)' },
  { code: 'gv', name: 'Gaelic (Manx)' },
  { code: 'ka', name: 'Georgian' },
  { code: 'el', name: 'Greek' },
  { code: 'kl', name: 'Greenlandic' },
  { code: 'gn', name: 'Guarani' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'ht', name: 'Haitian Creole' },
  { code: 'ha', name: 'Hausa' },
  { code: 'he', name: 'Hebrew' },
  { code: 'hz', name: 'Herero' },
  { code: 'ho', name: 'Hiri Motu' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'is', name: 'Icelandic' },
  { code: 'io', name: 'Ido' },
  { code: 'ig', name: 'Igbo' },
  { code: 'ia', name: 'Interlingua' },
  { code: 'ie', name: 'Interlingue' },
  { code: 'iu', name: 'Inuktitut' },
  { code: 'ik', name: 'Inupiak' },
  { code: 'ga', name: 'Irish' },
  { code: 'it', name: 'Italian' },
  { code: 'jv', name: 'Javanese' },
  { code: 'kn', name: 'Kannada' },
  { code: 'kr', name: 'Kanuri' },
  { code: 'ks', name: 'Kashmiri' },
  { code: 'kk', name: 'Kazakh' },
  { code: 'km', name: 'Khmer' },
  { code: 'ki', name: 'Kikuyu' },
  { code: 'rw', name: 'Kinyarwanda (Rwanda)' },
  { code: 'rn', name: 'Kirundi' },
  { code: 'ky', name: 'Kyrgyz' },
  { code: 'kv', name: 'Komi' },
  { code: 'kg', name: 'Kongo' },
  { code: 'ko', name: 'Korean' },
  { code: 'ku', name: 'Kurdish' },
  { code: 'kj', name: 'Kwanyama' },
  { code: 'lo', name: 'Lao' },
  { code: 'la', name: 'Latin' },
  { code: 'lv', name: 'Latvian (Lettish)' },
  { code: 'lij', name: 'Ligurian' },
  { code: 'li', name: 'Limburgish (Limburger)' },
  { code: 'ln', name: 'Lingala' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'lmo', name: 'Lombard' },
  { code: 'lu', name: 'Luga-Katanga' },
  { code: 'lg', name: 'Luganda, Ganda' },
  { code: 'lb', name: 'Luxembourgish' },
  { code: 'mk', name: 'Macedonian' },
  { code: 'mg', name: 'Malagasy' },
  { code: 'ms', name: 'Malay' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'mt', name: 'Maltese' },
  { code: 'mi', name: 'Maori' },
  { code: 'mr', name: 'Marathi' },
  { code: 'mh', name: 'Marshallese' },
  { code: 'mo', name: 'Moldavian' },
  { code: 'mn', name: 'Mongolian' },
  { code: 'na', name: 'Nauru' },
  { code: 'nv', name: 'Navajo' },
  { code: 'ng', name: 'Ndonga' },
  { code: 'nd', name: 'Northern Ndebele' },
  { code: 'nap', name: 'Neapolitan' },
  { code: 'ne', name: 'Nepali' },
  { code: 'no', name: 'Norwegian' },
  { code: 'nb', name: 'Norwegian bokm\u00E5l' },
  { code: 'nn', name: 'Norwegian nynorsk' },
  { code: 'ii', name: 'Nuosu' },
  { code: 'oc', name: 'Occitan' },
  { code: 'oj', name: 'Ojibwe' },
  { code: 'cu', name: 'Old Church Slavonic, Old Bulgarian' },
  { code: 'or', name: 'Oriya' },
  { code: 'om', name: 'Oromo (Afaan Oromo)' },
  { code: 'os', name: 'Ossetian' },
  { code: 'pi', name: 'P\u0101li' },
  { code: 'ps', name: 'Pashto, Pushto' },
  { code: 'fa', name: 'Persian (Farsi)' },
  { code: 'pl', name: 'Polish' },
  { code: 'pa', name: 'Punjabi (Eastern)' },
  { code: 'qu', name: 'Quechua' },
  { code: 'rm', name: 'Romansh' },
  { code: 'ro', name: 'Romanian' },
  { code: 'se', name: 'Sami' },
  { code: 'sm', name: 'Samoan' },
  { code: 'sg', name: 'Sango' },
  { code: 'srd', name: 'Sardinian' },
  { code: 'sa', name: 'Sanskrit' },
  { code: 'sr', name: 'Serbian' },
  { code: 'sh', name: 'Serbo-Croatian' },
  { code: 'st', name: 'Sesotho' },
  { code: 'tn', name: 'Setswana' },
  { code: 'sn', name: 'Shona' },
  { code: 'scn', name: 'Sicilian' },
  { code: 'sd', name: 'Sindhi' },
  { code: 'si', name: 'Sinhalese' },
  { code: 'ss', name: 'Siswati' },
  { code: 'sk', name: 'Slovak' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'so', name: 'Somali' },
  { code: 'nr', name: 'Southern Ndebele' },
  { code: 'su', name: 'Sundanese' },
  { code: 'sw', name: 'Swahili (Kiswahili)' },
  { code: 'sv', name: 'Swedish' },
  { code: 'tl', name: 'Tagalog' },
  { code: 'ty', name: 'Tahitian' },
  { code: 'tg', name: 'Tajik' },
  { code: 'ta', name: 'Tamil' },
  { code: 'tt', name: 'Tatar' },
  { code: 'te', name: 'Telugu' },
  { code: 'th', name: 'Thai' },
  { code: 'bo', name: 'Tibetan' },
  { code: 'ti', name: 'Tigrinya' },
  { code: 'to', name: 'Tonga' },
  { code: 'ts', name: 'Tsonga' },
  { code: 'tk', name: 'Turkmen' },
  { code: 'tw', name: 'Twi' },
  { code: 'ug', name: 'Uyghur' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'uz', name: 'Uzbek' },
  { code: 've', name: 'Venda' },
  { code: 'vec', name: 'Venetian' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'vo', name: 'Volap\u00FCk' },
  { code: 'wa', name: 'Wallon' },
  { code: 'cy', name: 'Welsh' },
  { code: 'wo', name: 'Wolof' },
  { code: 'fy', name: 'Western Frisian' },
  { code: 'xh', name: 'Xhosa' },
  { code: 'sah', name: 'Yakut' },
  { code: 'yi', name: 'Yiddish' },
  { code: 'yo', name: 'Yoruba' },
  { code: 'za', name: 'Zhuang, Chuang' },
  { code: 'zu', name: 'Zulu' },
];

// ---------------------------------------------------------------------------
// Speech-to-text language list
// ---------------------------------------------------------------------------

export const speechToTextLanguageList: CodeNameItem[] = [
  { name: 'Afrikaans (South Africa)', code: 'af-ZA' },
  { name: 'Albanian (Albania)', code: 'sq-AL' },
  { name: 'Amharic (Ethiopia)', code: 'am-ET' },
  { name: 'Arabic (Algeria)', code: 'ar-DZ' },
  { name: 'Arabic (Bahrain)', code: 'ar-BH' },
  { name: 'Arabic (Egypt)', code: 'ar-EG' },
  { name: 'Arabic (Iraq)', code: 'ar-IQ' },
  { name: 'Arabic (Israel)', code: 'ar-IL' },
  { name: 'Arabic (Jordan)', code: 'ar-JO' },
  { name: 'Arabic (Kuwait)', code: 'ar-KW' },
  { name: 'Arabic (Lebanon)', code: 'ar-LB' },
  { name: 'Arabic (Mauritania)', code: 'ar-MR' },
  { name: 'Arabic (Morocco)', code: 'ar-MA' },
  { name: 'Arabic (Oman)', code: 'ar-OM' },
  { name: 'Arabic (Qatar)', code: 'ar-QA' },
  { name: 'Arabic (Saudi Arabia)', code: 'ar-SA' },
  { name: 'Arabic (State of Palestine)', code: 'ar-PS' },
  { name: 'Arabic (Tunisia)', code: 'ar-TN' },
  { name: 'Arabic (United Arab Emirates)', code: 'ar-AE' },
  { name: 'Arabic (Yemen)', code: 'ar-YE' },
  { name: 'Armenian (Armenia)', code: 'hy-AM' },
  { name: 'Azerbaijani (Azerbaijan)', code: 'az-AZ' },
  { name: 'Basque (Spain)', code: 'eu-ES' },
  { name: 'Bengali (Bangladesh)', code: 'bn-BD' },
  { name: 'Bengali (India)', code: 'bn-IN' },
  { name: 'Bosnian (Bosnia and Herzegovina)', code: 'bs-BA' },
  { name: 'Bulgarian (Bulgaria)', code: 'bg-BG' },
  { name: 'Burmese (Myanmar)', code: 'my-MM' },
  { name: 'Catalan (Spain)', code: 'ca-ES' },
  { name: 'Chinese, Cantonese (Traditional Hong Kong)', code: 'yue-Hant-HK' },
  { name: 'Chinese, Mandarin (Simplified, China)', code: 'zh' },
  { name: 'Chinese, Mandarin (Traditional, Taiwan)', code: 'zh-TW' },
  { name: 'Croatian (Croatia)', code: 'hr-HR' },
  { name: 'Czech (Czech Republic)', code: 'cs-CZ' },
  { name: 'Danish (Denmark)', code: 'da-DK' },
  { name: 'Dutch (Belgium)', code: 'nl-BE' },
  { name: 'Dutch (Netherlands)', code: 'nl-NL' },
  { name: 'English (Australia)', code: 'en-AU' },
  { name: 'English (Canada)', code: 'en-CA' },
  { name: 'English (Ghana)', code: 'en-GH' },
  { name: 'English (Hong Kong)', code: 'en-HK' },
  { name: 'English (India)', code: 'en-IN' },
  { name: 'English (Ireland)', code: 'en-IE' },
  { name: 'English (Kenya)', code: 'en-KE' },
  { name: 'English (New Zealand)', code: 'en-NZ' },
  { name: 'English (Nigeria)', code: 'en-NG' },
  { name: 'English (Pakistan)', code: 'en-PK' },
  { name: 'English (Philippines)', code: 'en-PH' },
  { name: 'English (Singapore)', code: 'en-SG' },
  { name: 'English (South Africa)', code: 'en-ZA' },
  { name: 'English (Tanzania)', code: 'en-TZ' },
  { name: 'English (United Kingdom)', code: 'en-GB' },
  { name: 'English (United States)', code: 'en-US' },
  { name: 'Estonian (Estonia)', code: 'et-EE' },
  { name: 'Filipino (Philippines)', code: 'fil-PH' },
  { name: 'Finnish (Finland)', code: 'fi-FI' },
  { name: 'French (Belgium)', code: 'fr-BE' },
  { name: 'French (Canada)', code: 'fr-CA' },
  { name: 'French (France)', code: 'fr-FR' },
  { name: 'French (Switzerland)', code: 'fr-CH' },
  { name: 'Galician (Spain)', code: 'gl-ES' },
  { name: 'Georgian (Georgia)', code: 'ka-GE' },
  { name: 'German (Austria)', code: 'de-AT' },
  { name: 'German (Germany)', code: 'de-DE' },
  { name: 'German (Switzerland)', code: 'de-CH' },
  { name: 'Greek (Greece)', code: 'el-GR' },
  { name: 'Gujarati (India)', code: 'gu-IN' },
  { name: 'Hebrew (Israel)', code: 'iw-IL' },
  { name: 'Hindi (India)', code: 'hi-IN' },
  { name: 'Hungarian (Hungary)', code: 'hu-HU' },
  { name: 'Icelandic (Iceland)', code: 'is-IS' },
  { name: 'Indonesian (Indonesia)', code: 'id-ID' },
  { name: 'Italian (Italy)', code: 'it-IT' },
  { name: 'Italian (Switzerland)', code: 'it-CH' },
  { name: 'Japanese (Japan)', code: 'ja-JP' },
  { name: 'Javanese (Indonesia)', code: 'jv-ID' },
  { name: 'Kannada (India)', code: 'kn-IN' },
  { name: 'Kazakh (Kazakhstan)', code: 'kk-KZ' },
  { name: 'Khmer (Cambodia)', code: 'km-KH' },
  { name: 'Kinyarwanda (Rwanda)', code: 'rw-RW' },
  { name: 'Korean (South Korea)', code: 'ko-KR' },
  { name: 'Lao (Laos)', code: 'lo-LA' },
  { name: 'Latvian (Latvia)', code: 'lv-LV' },
  { name: 'Lithuanian (Lithuania)', code: 'lt-LT' },
  { name: 'Macedonian (North Macedonia)', code: 'mk-MK' },
  { name: 'Malay (Malaysia)', code: 'ms-MY' },
  { name: 'Malayalam (India)', code: 'ml-IN' },
  { name: 'Marathi (India)', code: 'mr-IN' },
  { name: 'Mongolian (Mongolia)', code: 'mn-MN' },
  { name: 'Nepali (Nepal)', code: 'ne-NP' },
  { name: 'Norwegian Bokm\u00E5l (Norway)', code: 'no-NO' },
  { name: 'Persian (Iran)', code: 'fa-IR' },
  { name: 'Polish (Poland)', code: 'pl-PL' },
  { name: 'Portuguese (Brazil)', code: 'pt-BR' },
  { name: 'Portuguese (Portugal)', code: 'pt-PT' },
  { name: 'Punjabi (Gurmukhi India)', code: 'pa-Guru-IN' },
  { name: 'Romanian (Romania)', code: 'ro-RO' },
  { name: 'Russian (Russia)', code: 'ru-RU' },
  { name: 'Serbian (Serbia)', code: 'sr-RS' },
  { name: 'Sinhala (Sri Lanka)', code: 'si-LK' },
  { name: 'Slovak (Slovakia)', code: 'sk-SK' },
  { name: 'Slovenian (Slovenia)', code: 'sl-SI' },
  { name: 'Southern Sotho (South Africa)', code: 'st-ZA' },
  { name: 'Spanish (Argentina)', code: 'es-AR' },
  { name: 'Spanish (Bolivia)', code: 'es-BO' },
  { name: 'Spanish (Chile)', code: 'es-CL' },
  { name: 'Spanish (Colombia)', code: 'es-CO' },
  { name: 'Spanish (Costa Rica)', code: 'es-CR' },
  { name: 'Spanish (Dominican Republic)', code: 'es-DO' },
  { name: 'Spanish (Ecuador)', code: 'es-EC' },
  { name: 'Spanish (El Salvador)', code: 'es-SV' },
  { name: 'Spanish (Guatemala)', code: 'es-GT' },
  { name: 'Spanish (Honduras)', code: 'es-HN' },
  { name: 'Spanish (Mexico)', code: 'es-MX' },
  { name: 'Spanish (Nicaragua)', code: 'es-NI' },
  { name: 'Spanish (Panama)', code: 'es-PA' },
  { name: 'Spanish (Paraguay)', code: 'es-PY' },
  { name: 'Spanish (Peru)', code: 'es-PE' },
  { name: 'Spanish (Puerto Rico)', code: 'es-PR' },
  { name: 'Spanish (Spain)', code: 'es-ES' },
  { name: 'Spanish (United States)', code: 'es-US' },
  { name: 'Spanish (Uruguay)', code: 'es-UY' },
  { name: 'Spanish (Venezuela)', code: 'es-VE' },
  { name: 'Sundanese (Indonesia)', code: 'su-ID' },
  { name: 'Swahili (Kenya)', code: 'sw-KE' },
  { name: 'Swahili (Tanzania)', code: 'sw-TZ' },
  { name: 'Swati (Latin, South Africa)', code: 'ss-Latn-ZA' },
  { name: 'Swedish (Sweden)', code: 'sv-SE' },
  { name: 'Tamil (India)', code: 'ta-IN' },
  { name: 'Tamil (Malaysia)', code: 'ta-MY' },
  { name: 'Tamil (Singapore)', code: 'ta-SG' },
  { name: 'Tamil (Sri Lanka)', code: 'ta-LK' },
  { name: 'Telugu (India)', code: 'te-IN' },
  { name: 'Thai (Thailand)', code: 'th-TH' },
  { name: 'Tsonga (South Africa)', code: 'ts-ZA' },
  { name: 'Tswana (Latin, South Africa)', code: 'tn-Latn-ZA' },
  { name: 'Turkish (Turkey)', code: 'tr-TR' },
  { name: 'Ukrainian (Ukraine)', code: 'uk-UA' },
  { name: 'Urdu (India)', code: 'ur-IN' },
  { name: 'Urdu (Pakistan)', code: 'ur-PK' },
  { name: 'Uzbek (Uzbekistan)', code: 'uz-UZ' },
  { name: 'Venda (South Africa)', code: 've-ZA' },
  { name: 'Vietnamese (Vietnam)', code: 'vi-VN' },
  { name: 'Xhosa (South Africa)', code: 'xh-ZA' },
  { name: 'Zulu (South Africa)', code: 'zu-ZA' },
];

// ---------------------------------------------------------------------------
// Report reason list
// ---------------------------------------------------------------------------

export const reportReasonList: CodeNameItem[] = [
  { code: 'select', name: 'Select reason' },
  { code: 'discriminatory', name: 'Racism, sexism, homophobia, hate, or other discrimination' },
  { code: 'spam', name: 'Spam' },
  { code: 'irrelevant', name: 'Irrelevant or annoying' },
  { code: 'wrong', name: 'Wrong tag or language' },
];

// ---------------------------------------------------------------------------
// Personality / characteristic lists (Custom Instruction Editor)
// ---------------------------------------------------------------------------

export const baseStyleList: CodeNameItem[] = [
  { name: 'Default', code: 'default', subtitle: 'Preset style or tone' },
  { name: 'Professional', code: 'professional', subtitle: 'Polished and precise' },
  { name: 'Friendly', code: 'friendly', subtitle: 'Warm and chatty' },
  { name: 'Candid', code: 'candid', subtitle: 'Direct and encouraging' },
  { name: 'Quirky', code: 'quirky', subtitle: 'Playful and imaginative' },
  { name: 'Efficient', code: 'efficient', subtitle: 'Concise and plain' },
  { name: 'Nerdy', code: 'nerdy', subtitle: 'Exploratory and enthusiastic' },
  { name: 'Cynical', code: 'cynical', subtitle: 'Critical and sarcastic' },
];

export const characteristicListWarm: CodeNameItem[] = [
  { name: 'More', code: 'more', subtitle: 'Friendlier and more personable' },
  { name: 'Default', code: 'default', subtitle: '' },
  { name: 'Less', code: 'less', subtitle: 'More professional and factual' },
];

export const characteristicListEnthusiastic: CodeNameItem[] = [
  { name: 'More', code: 'more', subtitle: 'More energy and excitement' },
  { name: 'Default', code: 'default', subtitle: '' },
  { name: 'Less', code: 'less', subtitle: 'Calmer and more natural' },
];

export const characteristicListScannable: CodeNameItem[] = [
  { name: 'More', code: 'more', subtitle: 'Use clear formatting and lists' },
  { name: 'Default', code: 'default', subtitle: '' },
  { name: 'Less', code: 'less', subtitle: 'More paragraphs instead of lists' },
];

export const characteristicListEmoji: CodeNameItem[] = [
  { name: 'More', code: 'more', subtitle: 'Use more emoji' },
  { name: 'Default', code: 'default', subtitle: '' },
  { name: 'Less', code: 'less', subtitle: "Don't use as many emoji" },
];

// ---------------------------------------------------------------------------
// Backup model definitions
// ---------------------------------------------------------------------------

export interface BackupModel {
  slug: string;
  max_tokens: number;
  title: string;
  description: string;
  tags: string[];
  capabilities: Record<string, unknown>;
  product_features: Record<string, unknown>;
  enable_infer: boolean;
  enable_infer_opt_out: boolean;
  reasoning_type: 'auto' | 'none' | 'reasoning';
  configurable_thinking_effort?: boolean;
  thinking_efforts?: Array<{
    thinking_effort: string;
    full_label: string;
    mobile_full_label: string;
    short_label: string;
    description: string;
  }>;
  enabled_tools: string[];
}

export const backupModels: BackupModel[] = [
  {
    slug: 'gpt-5-2',
    max_tokens: 44815,
    title: 'GPT-5.2',
    description: 'Our latest and most advanced model',
    tags: ['history_off_approved'],
    capabilities: {},
    product_features: {
      attachments: { type: 'retrieval', can_accept_all_mime_types: true },
      contextual_answers: { is_eligible_for_contextual_answers: true },
    },
    enable_infer: false,
    enable_infer_opt_out: false,
    reasoning_type: 'auto',
    configurable_thinking_effort: false,
    thinking_efforts: [],
    enabled_tools: ['tools', 'tools2', 'search', 'canvas', 'image_gen_tool_enabled'],
  },
  {
    slug: 'gpt-5-2-instant',
    max_tokens: 44815,
    title: 'GPT-5.2 Instant',
    description: 'Our latest and most advanced model',
    tags: ['history_off_approved'],
    capabilities: {},
    product_features: {
      attachments: { type: 'retrieval', can_accept_all_mime_types: true },
      contextual_answers: { is_eligible_for_contextual_answers: true },
    },
    enable_infer: false,
    enable_infer_opt_out: false,
    reasoning_type: 'none',
    configurable_thinking_effort: false,
    thinking_efforts: [],
    enabled_tools: ['tools', 'tools2', 'search', 'canvas', 'image_gen_tool_enabled'],
  },
  {
    slug: 'gpt-5-2-thinking',
    max_tokens: 196608,
    title: 'GPT-5.2 Thinking',
    description: 'Our latest and most advanced model',
    tags: ['history_off_approved'],
    capabilities: {},
    product_features: {
      attachments: { type: 'retrieval', can_accept_all_mime_types: true },
      contextual_answers: { is_eligible_for_contextual_answers: true },
    },
    enable_infer: false,
    enable_infer_opt_out: false,
    reasoning_type: 'reasoning',
    configurable_thinking_effort: true,
    thinking_efforts: [
      {
        thinking_effort: 'standard',
        full_label: 'Thinking',
        mobile_full_label: 'Thinking',
        short_label: 'Standard',
        description: 'Balanced thinking and speed',
      },
      {
        thinking_effort: 'extended',
        full_label: 'Extended thinking',
        mobile_full_label: 'Extended',
        short_label: 'Extended',
        description: 'Thinks longer for complex questions',
      },
    ],
    enabled_tools: ['tools', 'tools2', 'search', 'canvas', 'image_gen_tool_enabled'],
  },
  {
    slug: 'gpt-5-1',
    max_tokens: 35815,
    title: 'GPT-5.1',
    description: 'Our latest and most advanced model',
    tags: ['history_off_approved'],
    capabilities: {},
    product_features: {
      attachments: { type: 'retrieval', can_accept_all_mime_types: true },
      contextual_answers: { is_eligible_for_contextual_answers: true },
    },
    enable_infer: false,
    enable_infer_opt_out: false,
    reasoning_type: 'auto',
    configurable_thinking_effort: false,
    enabled_tools: ['tools', 'tools2', 'search', 'canvas', 'image_gen_tool_enabled'],
  },
  {
    slug: 'gpt-5-1-instant',
    max_tokens: 35815,
    title: 'GPT-5.1 Instant',
    description: 'Our latest and most advanced model',
    tags: ['history_off_approved'],
    capabilities: {},
    product_features: {
      attachments: { type: 'retrieval', can_accept_all_mime_types: true },
      contextual_answers: { is_eligible_for_contextual_answers: true },
    },
    enable_infer: false,
    enable_infer_opt_out: false,
    reasoning_type: 'none',
    configurable_thinking_effort: false,
    enabled_tools: ['tools', 'tools2', 'search', 'canvas', 'image_gen_tool_enabled'],
  },
  {
    slug: 'gpt-5-1-thinking',
    max_tokens: 196608,
    title: 'GPT-5.1 Thinking',
    description: 'Our latest and most advanced model',
    tags: ['history_off_approved'],
    capabilities: {},
    product_features: {
      attachments: { type: 'retrieval', can_accept_all_mime_types: true },
      contextual_answers: { is_eligible_for_contextual_answers: true },
    },
    enable_infer: false,
    enable_infer_opt_out: false,
    reasoning_type: 'reasoning',
    configurable_thinking_effort: true,
    enabled_tools: ['tools', 'tools2', 'search', 'canvas', 'image_gen_tool_enabled'],
  },
  {
    slug: 'gpt-5',
    max_tokens: 34815,
    title: 'GPT-5 Auto',
    description: 'GPT-5 Auto',
    tags: ['history_off_approved', 'gpt4'],
    capabilities: {},
    product_features: {
      attachments: { type: 'retrieval', can_accept_all_mime_types: true },
      contextual_answers: { is_eligible_for_contextual_answers: true },
    },
    enable_infer: false,
    enable_infer_opt_out: true,
    reasoning_type: 'auto',
    enabled_tools: ['tools', 'tools2', 'search', 'canvas', 'image_gen_tool_enabled'],
  },
  {
    slug: 'gpt-5-mini',
    max_tokens: 8191,
    title: 'GPT-5 Mini',
    description: 'GPT-5 Mini',
    tags: ['history_off_approved', 'gpt3.5'],
    capabilities: {},
    product_features: {},
    enable_infer: false,
    enable_infer_opt_out: false,
    reasoning_type: 'none',
    enabled_tools: ['image_gen_tool_enabled'],
  },
  {
    slug: 'gpt-5-instant',
    max_tokens: 34815,
    title: 'GPT-5 Fast',
    description: 'GPT-5 Fast',
    tags: ['history_off_approved', 'gpt4'],
    capabilities: {},
    product_features: {
      attachments: { type: 'retrieval', can_accept_all_mime_types: true },
      contextual_answers: { is_eligible_for_contextual_answers: true },
    },
    enable_infer: false,
    enable_infer_opt_out: false,
    reasoning_type: 'none',
    enabled_tools: ['tools', 'tools2', 'search', 'canvas', 'image_gen_tool_enabled'],
  },
  {
    slug: 'gpt-5-thinking',
    max_tokens: 196608,
    title: 'GPT-5 Thinking',
    description: 'GPT-5 Thinking',
    tags: ['history_off_approved'],
    capabilities: {},
    product_features: {
      attachments: { type: 'retrieval', can_accept_all_mime_types: true },
      contextual_answers: { is_eligible_for_contextual_answers: true },
    },
    enable_infer: false,
    enable_infer_opt_out: true,
    reasoning_type: 'reasoning',
    enabled_tools: ['tools', 'tools2', 'search', 'canvas', 'image_gen_tool_enabled'],
  },
  {
    slug: 'gpt-5-t-mini',
    max_tokens: 196608,
    title: 'GPT-5 Thinking Mini',
    description: 'GPT-5 Thinking mini',
    tags: ['history_off_approved'],
    capabilities: {},
    product_features: {
      attachments: { type: 'retrieval', can_accept_all_mime_types: true },
      contextual_answers: { is_eligible_for_contextual_answers: true },
    },
    enable_infer: false,
    enable_infer_opt_out: true,
    reasoning_type: 'reasoning',
    enabled_tools: ['tools', 'tools2', 'search', 'canvas', 'image_gen_tool_enabled'],
  },
  {
    slug: 'gpt-4o',
    max_tokens: 34815,
    title: 'GPT-4o',
    description: 'GPT-4o',
    tags: ['gpt4o', 'history_off_approved', 'gpt4'],
    capabilities: {},
    product_features: {
      attachments: { type: 'retrieval', can_accept_all_mime_types: true },
      contextual_answers: { is_eligible_for_contextual_answers: true },
    },
    enable_infer: false,
    enable_infer_opt_out: true,
    reasoning_type: 'none',
    enabled_tools: ['tools', 'tools2', 'search', 'canvas', 'image_gen_tool_enabled'],
  },
  {
    slug: 'gpt-4-1',
    max_tokens: 34815,
    title: 'GPT-4.1',
    description: 'GPT-4.1',
    tags: ['history_off_approved', 'gpt4'],
    capabilities: {},
    product_features: {
      attachments: { type: 'retrieval', can_accept_all_mime_types: true },
      contextual_answers: { is_eligible_for_contextual_answers: true },
    },
    enable_infer: false,
    enable_infer_opt_out: false,
    reasoning_type: 'none',
    enabled_tools: ['tools', 'tools2', 'search', 'canvas', 'image_gen_tool_enabled'],
  },
  {
    slug: 'gpt-4-1-mini',
    max_tokens: 32767,
    title: 'GPT-4.1 Mini',
    description: 'Browsing, Advanced Data Analysis, and DALL\u00B7E are now built into GPT-4',
    tags: ['gpt4o', 'history_off_approved', 'gpt3.5', 'gpt4'],
    capabilities: {},
    product_features: {
      attachments: { type: 'retrieval', can_accept_all_mime_types: true },
    },
    enable_infer: false,
    enable_infer_opt_out: false,
    reasoning_type: 'none',
    enabled_tools: ['tools', 'tools2', 'search', 'canvas', 'image_gen_tool_enabled'],
  },
  {
    slug: 'o3',
    max_tokens: 196608,
    title: 'o3',
    description: 'O3',
    tags: ['history_off_approved'],
    capabilities: {},
    product_features: {
      attachments: { type: 'retrieval', can_accept_all_mime_types: true },
      contextual_answers: { is_eligible_for_contextual_answers: true },
    },
    enable_infer: false,
    enable_infer_opt_out: false,
    reasoning_type: 'reasoning',
    enabled_tools: ['tools', 'tools2', 'search', 'canvas', 'image_gen_tool_enabled'],
  },
  {
    slug: 'o4-mini',
    max_tokens: 196608,
    title: 'o4-mini',
    description: 'O4 mini',
    tags: ['history_off_approved'],
    capabilities: {},
    product_features: {
      attachments: { type: 'retrieval', can_accept_all_mime_types: true },
      contextual_answers: { is_eligible_for_contextual_answers: true },
    },
    enable_infer: false,
    enable_infer_opt_out: false,
    reasoning_type: 'reasoning',
    enabled_tools: ['tools', 'tools2', 'search', 'canvas', 'image_gen_tool_enabled'],
  },
  {
    slug: 'o4-mini-high',
    max_tokens: 196608,
    title: 'o4-mini-high',
    description: 'O4 mini high',
    tags: ['history_off_approved'],
    capabilities: {},
    product_features: {
      attachments: { type: 'retrieval', can_accept_all_mime_types: true },
      contextual_answers: { is_eligible_for_contextual_answers: true },
    },
    enable_infer: false,
    enable_infer_opt_out: false,
    reasoning_type: 'reasoning',
    enabled_tools: ['tools', 'tools2', 'search', 'canvas', 'image_gen_tool_enabled'],
  },
  {
    slug: 'text-davinci-002-render-sha',
    max_tokens: 8191,
    title: 'GPT-3.5',
    description: 'Our fastest model, great for most everyday tasks.',
    tags: ['history_off_approved', 'gpt3.5'],
    capabilities: {},
    product_features: {},
    enable_infer: false,
    enable_infer_opt_out: false,
    reasoning_type: 'none',
    enabled_tools: ['image_gen_tool_enabled'],
  },
];
