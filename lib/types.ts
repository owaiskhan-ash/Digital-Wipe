export type Category =
  | "people-search"
  | "marketing"
  | "adtech"
  | "breach"
  | "public-records"
  | "search";

export type DataType =
  | "fullName"
  | "city"
  | "homeAddress"
  | "formerAddresses"
  | "phone"
  | "email"
  | "age"
  | "relatives"
  | "associates"
  | "employer"
  | "jobTitle"
  | "salary"
  | "propertyRecords"
  | "courtRecords"
  | "marriageRecords"
  | "voterRecord"
  | "socialProfiles"
  | "photos"
  | "usernames"
  | "interests"
  | "purchaseHistory"
  | "locationHistory"
  | "deviceId"
  | "ipAddress"
  | "politicalAffinity"
  | "credentials"
  | "passwordHash";

export type Risk = "high" | "medium" | "low";
export type Effort = "easy" | "medium" | "hard";

/** What the primary fix for a listing is. */
export type Fix = "email" | "form" | "secure" | "review";

export type CategoryMeta = {
  id: Category;
  label: string;
  short: string;
  blurb: string;
  fix: Fix;
};

export const CATEGORIES: Record<Category, CategoryMeta> = {
  "people-search": {
    id: "people-search",
    label: "People-search directories",
    short: "People search",
    blurb:
      "Sites that assemble a public profile out of your name, address, phone and relatives, and sell lookups to anyone.",
    fix: "form",
  },
  marketing: {
    id: "marketing",
    label: "Marketing & B2B data brokers",
    short: "Marketing",
    blurb:
      "Companies that trade contact lists, buying signals and firmographics for advertising and sales outreach.",
    fix: "email",
  },
  adtech: {
    id: "adtech",
    label: "Ad-tech & tracking profiles",
    short: "Ad tech",
    blurb:
      "Advertising identifiers and inferred interests attached to your devices and browsing behaviour.",
    fix: "form",
  },
  breach: {
    id: "breach",
    label: "Breach & credential exposure",
    short: "Breaches",
    blurb:
      "Email and password combinations from past data breaches, often still circulating in searchable archives.",
    fix: "secure",
  },
  "public-records": {
    id: "public-records",
    label: "Public & government records",
    short: "Public records",
    blurb:
      "Voter files, property, court and licensing records that are public by law but rarely meant to be this easy to find.",
    fix: "review",
  },
  search: {
    id: "search",
    label: "Search & archive visibility",
    short: "Search results",
    blurb:
      "Pages and cached copies that still surface your name in search engines and web archives.",
    fix: "review",
  },
};

export type Broker = {
  id: string;
  name: string;
  domain: string;
  category: Category;
  /** What this source generally exposes about a person. */
  data: DataType[];
  /** Official opt-out / suppression page. */
  removalUrl: string;
  /** Public privacy contact where one is published. Editable in the composer. */
  email?: string;
  effort: Effort;
  /** Rough share of profiles this source holds, used by the matching model. */
  coverage: number;
  note?: string;
};

export type Profile = {
  fullName: string;
  city: string;
  region: string;
  country: string;
  emails: string[];
  phones: string[];
  usernames: string[];
};

export type Finding = {
  id: string;
  brokerId: string;
  broker: string;
  domain: string;
  category: Category;
  data: DataType[];
  risk: Risk;
  effort: Effort;
  fix: Fix;
  removalUrl: string;
  contactEmail?: string;
  /** Public page a person can inspect (site root or a live search). */
  inspectUrl: string;
  firstSeen: string;
  lastSeen: string;
  summary: string;
  note?: string;
};

export type BreachExposure = {
  id: string;
  name: string;
  year: number;
  accounts: string;
  exposed: string[];
  risk: Risk;
  checkUrl: string;
  advice: string;
};

export type ScanResult = {
  id: string;
  createdAt: string;
  profile: Profile;
  checked: number;
  findings: Finding[];
  breaches: BreachExposure[];
  demo: boolean;
};

export type RequestStatus = "drafted" | "sent" | "confirmed" | "removed" | "refused";

export const REQUEST_STATUS_META: Record<
  RequestStatus,
  { label: string; tone: string; help: string }
> = {
  drafted: {
    label: "Drafted",
    tone: "neutral",
    help: "Written, not sent yet.",
  },
  sent: {
    label: "Sent",
    tone: "moss",
    help: "Sent to the site. Most reply or act within 30 to 45 days.",
  },
  confirmed: {
    label: "Confirmed",
    tone: "lilac",
    help: "The company acknowledged your request.",
  },
  removed: {
    label: "Removed",
    tone: "moss",
    help: "Listing confirmed gone. Check again in 60 days.",
  },
  refused: {
    label: "Refused",
    tone: "clay",
    help: "Escalate to a regulator or a second request.",
  },
};

export type RemovalRequest = {
  id: string;
  findingId: string;
  brokerName: string;
  domain: string;
  category: Category;
  contactEmail: string;
  subject: string;
  body: string;
  status: RequestStatus;
  createdAt: string;
  sentAt?: string;
  followUpAt?: string;
  removalUrl: string;
};

export type StoredState = {
  scan: ScanResult | null;
  requests: RemovalRequest[];
  version: 1;
};

export const DATA_LABELS: Record<DataType, string> = {
  fullName: "Full name",
  city: "City / region",
  homeAddress: "Home address",
  formerAddresses: "Past addresses",
  phone: "Phone number",
  email: "Email address",
  age: "Age / birth year",
  relatives: "Relatives",
  associates: "Known associates",
  employer: "Employer",
  jobTitle: "Job title",
  salary: "Salary band",
  propertyRecords: "Property records",
  courtRecords: "Court records",
  marriageRecords: "Marriage records",
  voterRecord: "Voter file",
  socialProfiles: "Social profiles",
  photos: "Photos",
  usernames: "Usernames",
  interests: "Inferred interests",
  purchaseHistory: "Purchase history",
  locationHistory: "Location history",
  deviceId: "Device identifiers",
  ipAddress: "IP address",
  politicalAffinity: "Political lean",
  credentials: "Email in a breach",
  passwordHash: "Password hash",
};
