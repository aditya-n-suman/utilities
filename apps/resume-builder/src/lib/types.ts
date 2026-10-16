// TypeScript view of schema/resume.schema.json (v1.0). Keep the two in step:
// a field added there is added here, with the same name and optionality.

export type PartialDate = string; // YYYY, YYYY-MM or YYYY-MM-DD
export type EndDate = PartialDate | "present";

export interface Location {
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  postalCode?: string;
}

export type WorkMode = "onsite" | "remote" | "hybrid";

export type Highlight = string | { label?: string; text: string };

export type Network =
  | "linkedin" | "github" | "gitlab" | "stackoverflow" | "x" | "mastodon" | "bluesky" | "medium" | "devto"
  | "behance" | "dribbble" | "kaggle" | "leetcode" | "orcid" | "googlescholar" | "youtube" | "npm" | "other";

export interface Profile {
  network: Network;
  url: string;
  username?: string;
  label?: string;
}

export interface Basics {
  name: string;
  headline?: string;
  photo?: { src: string; alt?: string };
  initials?: string;
  email?: string;
  phone?: string;
  location?: Location;
  website?: { url: string; label?: string };
  profiles?: Profile[];
  summary?: string;
  extras?: { label: string; value: string }[];
}

export interface WorkItem {
  id?: string;
  company: string;
  title: string;
  context?: string;
  url?: string;
  employmentType?: "full-time" | "part-time" | "contract" | "freelance" | "internship" | "apprenticeship";
  location?: Location;
  workMode?: WorkMode;
  startDate: PartialDate;
  endDate?: EndDate;
  summary?: string;
  highlights?: Highlight[];
  technologies?: string[];
}

export interface EducationItem {
  id?: string;
  institution: string;
  degree?: string;
  field?: string;
  url?: string;
  location?: Location;
  startDate?: PartialDate;
  endDate?: EndDate;
  score?: { value: string; max?: string; label?: string };
  honors?: string;
  courses?: string[];
  highlights?: Highlight[];
}

export type SkillItem = string | { name: string; level?: number };

export interface SkillGroup {
  id?: string;
  name?: string;
  items: SkillItem[];
}

export interface ProjectItem {
  id?: string;
  name: string;
  kind?: string;
  role?: string;
  url?: string;
  repository?: string;
  startDate?: PartialDate;
  endDate?: EndDate;
  description?: string;
  highlights?: Highlight[];
  technologies?: string[];
}

export interface CertificationItem {
  id?: string;
  name: string;
  issuer?: string;
  date?: PartialDate;
  expires?: PartialDate;
  credentialId?: string;
  url?: string;
}

export interface AwardItem {
  id?: string;
  title: string;
  awarder?: string;
  date?: PartialDate;
  summary?: string;
}

export interface PublicationItem {
  id?: string;
  title: string;
  authors?: string[];
  venue?: string;
  date?: PartialDate;
  url?: string;
  doi?: string;
  summary?: string;
}

export interface LanguageItem {
  language: string;
  fluency?: "native" | "fluent" | "professional" | "intermediate" | "basic";
  cefr?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
}

export interface VolunteerItem {
  id?: string;
  organization: string;
  role?: string;
  url?: string;
  location?: Location;
  startDate?: PartialDate;
  endDate?: EndDate;
  summary?: string;
  highlights?: Highlight[];
}

export interface InterestItem {
  name: string;
  keywords?: string[];
}

export interface Reference {
  name: string;
  title?: string;
  company?: string;
  relationship?: string;
  email?: string;
  phone?: string;
  quote?: string;
}

export interface CustomItem {
  id?: string;
  title?: string;
  subtitle?: string;
  location?: Location;
  url?: string;
  startDate?: PartialDate;
  endDate?: EndDate;
  description?: string;
  highlights?: Highlight[];
}

export interface CustomSection {
  id: string;
  title: string;
  display?: "entries" | "bullets" | "tags" | "text";
  items: CustomItem[];
}

export type DateFormat = "MMM YYYY" | "MMMM YYYY" | "MM/YYYY" | "YYYY-MM" | "YYYY";
export type Avatar = "auto" | "initials" | "none";
export type PageSize = "A4" | "Letter";

export interface Preferences {
  template?: string;
  accentColor?: string;
  pageSize?: PageSize;
  dateFormat?: DateFormat;
  sectionOrder?: string[];
  hiddenSections?: string[];
  sectionTitles?: Record<string, string>;
  avatar?: Avatar;
  showSkillLevels?: boolean;
}

export interface Meta {
  locale?: string;
  title?: string;
  lastModified?: string;
  generator?: string;
  direction?: "ltr" | "rtl";
}

export interface Resume {
  $schema?: string;
  schemaVersion: "1.0";
  meta?: Meta;
  basics: Basics;
  work?: WorkItem[];
  education?: EducationItem[];
  skills?: SkillGroup[];
  projects?: ProjectItem[];
  certifications?: CertificationItem[];
  awards?: AwardItem[];
  publications?: PublicationItem[];
  languages?: LanguageItem[];
  volunteer?: VolunteerItem[];
  interests?: InterestItem[];
  references?: { availableOnRequest?: boolean; items?: Reference[] };
  customSections?: CustomSection[];
  preferences?: Preferences;
  [extension: `x-${string}`]: unknown;
}
