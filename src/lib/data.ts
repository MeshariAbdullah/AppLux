export type RentalTier = 'standard' | 'premium' | 'elite';

export type RentalEligibility = {
  limit: number;
  used: number;
  remaining: number;
  tier: RentalTier;
  assignedBy: string;
  assignedAt: string;
};

export type InvoiceStatus = 'due' | 'overdue' | 'paid';
export type Invoice = {
  id: string;
  title: string;
  contractRef: string;
  issuedAt: string;
  dueDate: string;
  amount: number;
  status: InvoiceStatus;
};

export type ContractStatus = 'active' | 'pending' | 'ended';
export type Contract = {
  id: string;
  title: string;
  counterparty: string;
  startDate: string;
  endDate: string;
  monthlyAmount: number;
  status: ContractStatus;
};

export type NoteStatus = 'signed' | 'pending' | 'defaulted';
export type PromissoryNote = {
  id: string;
  reference: string;
  counterparty: string;
  amount: number;
  dueDate: string;
  status: NoteStatus;
};

export type HistoryStatus = 'completed' | 'closed' | 'cancelled';
export type HistoryItem = {
  id: string;
  title: string;
  counterparty: string;
  closedAt: string;
  amount: number;
  status: HistoryStatus;
};

export const DEFAULT_ELIGIBILITY: RentalEligibility = {
  limit: 50000,
  used: 18500,
  remaining: 31500,
  tier: 'premium',
  assignedBy: 'AppLux',
  assignedAt: '2026-03-14',
};

export const SEED_INVOICES: Invoice[] = [
  {
    id: 'inv-1042',
    title: 'قسط إيجار — أبريل',
    contractRef: 'CN-2026-018',
    issuedAt: '2026-04-01',
    dueDate: '2026-04-25',
    amount: 2450,
    status: 'due',
  },
  {
    id: 'inv-1041',
    title: 'قسط إيجار — مارس',
    contractRef: 'CN-2026-018',
    issuedAt: '2026-03-01',
    dueDate: '2026-03-25',
    amount: 2450,
    status: 'overdue',
  },
  {
    id: 'inv-1039',
    title: 'قسط صيانة',
    contractRef: 'CN-2026-012',
    issuedAt: '2026-04-08',
    dueDate: '2026-04-30',
    amount: 620,
    status: 'due',
  },
];

export const SEED_CONTRACTS: Contract[] = [
  {
    id: 'CN-2026-018',
    title: 'تويوتا كامري 2024',
    counterparty: 'معرض الرياض للسيارات',
    startDate: '2026-01-15',
    endDate: '2027-01-14',
    monthlyAmount: 2450,
    status: 'active',
  },
  {
    id: 'CN-2026-012',
    title: 'شقة سكنية — حي الياسمين',
    counterparty: 'شركة المساكن العصرية',
    startDate: '2025-12-01',
    endDate: '2026-12-01',
    monthlyAmount: 4500,
    status: 'active',
  },
  {
    id: 'CN-2026-024',
    title: 'مكتب تجاري — طريق الملك فهد',
    counterparty: 'أبراج الأعمال',
    startDate: '2026-04-20',
    endDate: '2027-04-19',
    monthlyAmount: 6800,
    status: 'pending',
  },
];

export const SEED_NOTES: PromissoryNote[] = [
  {
    id: 'PN-0084',
    reference: 'SN-2026-084',
    counterparty: 'معرض الرياض للسيارات',
    amount: 29400,
    dueDate: '2027-01-14',
    status: 'signed',
  },
  {
    id: 'PN-0087',
    reference: 'SN-2026-087',
    counterparty: 'أبراج الأعمال',
    amount: 81600,
    dueDate: '2027-04-19',
    status: 'pending',
  },
];

export type Localized = { ar: string; en: string };

export type StoreCategory = 'cars' | 'properties' | 'equipment' | 'other';

export type StoreBranch = {
  id: string;
  name: Localized;
  address: Localized;
  phone: string;
  hours: Localized;
};

export type PartnerStore = {
  id: string;
  name: Localized;
  initials: string;
  category: StoreCategory;
  city: string;
  location: Localized;
  description: Localized;
  rating: number;
  hours: Localized;
  logoTone: 'brand' | 'gold' | 'ink' | 'success';
  verified: boolean;
  branches: StoreBranch[];
};

export const SEED_STORES: PartnerStore[] = [
  {
    id: 'riyadh-motors',
    name: { ar: 'معرض الرياض للسيارات', en: 'Riyadh Motors' },
    initials: 'RM',
    category: 'cars',
    city: 'riyadh',
    location: { ar: 'حي العليا، طريق الملك فهد', en: 'Olaya District, King Fahd Road' },
    description: {
      ar: 'معرض متخصص في تأجير سيارات السيدان والدفع الرباعي بأحدث الطرازات وخدمة استثنائية متكاملة.',
      en: 'Specialized showroom offering long-term rentals of sedans and SUVs with premium service.',
    },
    rating: 4.8,
    hours: { ar: 'السبت – الخميس، 9:00 ص – 11:00 م', en: 'Sat – Thu, 9:00 AM – 11:00 PM' },
    logoTone: 'brand',
    verified: true,
    branches: [
      {
        id: 'rm-olaya',
        name: { ar: 'فرع العليا', en: 'Olaya Branch' },
        address: { ar: 'طريق الملك فهد، العليا، الرياض', en: 'King Fahd Rd, Olaya, Riyadh' },
        phone: '+966112345671',
        hours: { ar: '9:00 ص – 11:00 م', en: '9:00 AM – 11:00 PM' },
      },
      {
        id: 'rm-malqa',
        name: { ar: 'فرع الملقا', en: 'Al Malqa Branch' },
        address: {
          ar: 'طريق الأمير محمد بن سلمان، الملقا، الرياض',
          en: 'Prince Mohammed Bin Salman Rd, Al Malqa, Riyadh',
        },
        phone: '+966112345672',
        hours: { ar: '10:00 ص – 10:00 م', en: '10:00 AM – 10:00 PM' },
      },
    ],
  },
  {
    id: 'jazira-auto',
    name: { ar: 'وكالة الجزيرة للسيارات', en: 'Al Jazira Auto' },
    initials: 'JA',
    category: 'cars',
    city: 'jeddah',
    location: { ar: 'حي الروضة، طريق الأمير سلطان', en: 'Al Rawdah, Prince Sultan Road' },
    description: {
      ar: 'وكيل معتمد لمجموعة واسعة من السيارات العائلية والتجارية مع باقات تأجير مرنة.',
      en: 'Authorized dealer for family and commercial vehicles with flexible rental packages.',
    },
    rating: 4.6,
    hours: { ar: 'يومياً، 10:00 ص – 11:00 م', en: 'Daily, 10:00 AM – 11:00 PM' },
    logoTone: 'ink',
    verified: true,
    branches: [
      {
        id: 'ja-rawdah',
        name: { ar: 'فرع الروضة', en: 'Al Rawdah Branch' },
        address: {
          ar: 'طريق الأمير سلطان، الروضة، جدة',
          en: 'Prince Sultan Rd, Al Rawdah, Jeddah',
        },
        phone: '+966126789012',
        hours: { ar: '10:00 ص – 11:00 م', en: '10:00 AM – 11:00 PM' },
      },
    ],
  },
  {
    id: 'modern-homes',
    name: { ar: 'شركة المساكن العصرية', en: 'Modern Homes Co.' },
    initials: 'MH',
    category: 'properties',
    city: 'riyadh',
    location: { ar: 'حي الياسمين، شارع التخصصي', en: 'Al Yasmeen, Takhassusi Street' },
    description: {
      ar: 'شركة رائدة في تأجير الوحدات السكنية المفروشة وشبه المفروشة بعقود سنوية مرنة.',
      en: 'A leading operator for furnished and semi-furnished residential rentals with flexible annual contracts.',
    },
    rating: 4.7,
    hours: { ar: 'السبت – الخميس، 9:00 ص – 9:00 م', en: 'Sat – Thu, 9:00 AM – 9:00 PM' },
    logoTone: 'gold',
    verified: true,
    branches: [
      {
        id: 'mh-yasmin',
        name: { ar: 'المكتب الرئيسي', en: 'Head Office' },
        address: {
          ar: 'شارع التخصصي، الياسمين، الرياض',
          en: 'Takhassusi St, Al Yasmeen, Riyadh',
        },
        phone: '+966114445566',
        hours: { ar: '9:00 ص – 9:00 م', en: '9:00 AM – 9:00 PM' },
      },
      {
        id: 'mh-narjis',
        name: { ar: 'فرع النرجس', en: 'Al Narjis Branch' },
        address: { ar: 'شارع الأمير تركي، النرجس', en: 'Prince Turki St, Al Narjis' },
        phone: '+966114445567',
        hours: { ar: '10:00 ص – 8:00 م', en: '10:00 AM – 8:00 PM' },
      },
      {
        id: 'mh-sahafa',
        name: { ar: 'فرع الصحافة', en: 'Al Sahafa Branch' },
        address: { ar: 'طريق الأمير تركي، الصحافة', en: 'Prince Turki Rd, Al Sahafa' },
        phone: '+966114445568',
        hours: { ar: '10:00 ص – 8:00 م', en: '10:00 AM – 8:00 PM' },
      },
    ],
  },
  {
    id: 'business-towers',
    name: { ar: 'أبراج الأعمال', en: 'Business Towers' },
    initials: 'BT',
    category: 'properties',
    city: 'khobar',
    location: { ar: 'كورنيش الخبر', en: 'Khobar Corniche' },
    description: {
      ar: 'مكاتب تجارية متميزة على كورنيش الخبر مع مرافق متكاملة وخدمات إدارة العقار.',
      en: 'Premium commercial offices on the Khobar Corniche with integrated facilities and management.',
    },
    rating: 4.5,
    hours: { ar: 'الأحد – الخميس، 8:00 ص – 5:00 م', en: 'Sun – Thu, 8:00 AM – 5:00 PM' },
    logoTone: 'brand',
    verified: true,
    branches: [
      {
        id: 'bt-corniche',
        name: { ar: 'برج الكورنيش', en: 'Corniche Tower' },
        address: { ar: 'طريق الكورنيش، الخبر', en: 'Corniche Rd, Khobar' },
        phone: '+966138887766',
        hours: { ar: '8:00 ص – 5:00 م', en: '8:00 AM – 5:00 PM' },
      },
    ],
  },
  {
    id: 'saudi-gear',
    name: { ar: 'معدّات البناء السعودية', en: 'Saudi Construction Gear' },
    initials: 'SG',
    category: 'equipment',
    city: 'dammam',
    location: { ar: 'المنطقة الصناعية الثانية', en: 'Second Industrial City' },
    description: {
      ar: 'تأجير معدات البناء الثقيلة والخفيفة للمقاولين وشركات التطوير بعقود شهرية وسنوية.',
      en: 'Rental of heavy and light construction equipment for contractors on monthly and annual terms.',
    },
    rating: 4.3,
    hours: { ar: 'السبت – الخميس، 7:00 ص – 6:00 م', en: 'Sat – Thu, 7:00 AM – 6:00 PM' },
    logoTone: 'ink',
    verified: true,
    branches: [
      {
        id: 'sg-dammam',
        name: { ar: 'المركز الصناعي', en: 'Industrial Hub' },
        address: {
          ar: 'المنطقة الصناعية الثانية، الدمام',
          en: '2nd Industrial City, Dammam',
        },
        phone: '+966138201020',
        hours: { ar: '7:00 ص – 6:00 م', en: '7:00 AM – 6:00 PM' },
      },
      {
        id: 'sg-jubail',
        name: { ar: 'فرع الجبيل', en: 'Jubail Branch' },
        address: { ar: 'المنطقة الصناعية، الجبيل', en: 'Industrial City, Jubail' },
        phone: '+966134567890',
        hours: { ar: '7:00 ص – 5:00 م', en: '7:00 AM – 5:00 PM' },
      },
    ],
  },
  {
    id: 'rawafid-office',
    name: { ar: 'روافد للأثاث المكتبي', en: 'Rawafid Office Furniture' },
    initials: 'RO',
    category: 'equipment',
    city: 'riyadh',
    location: { ar: 'حي الصحافة، شارع أنس بن مالك', en: 'Al Sahafa, Anas Ibn Malik St' },
    description: {
      ar: 'حلول أثاث مكتبي متكاملة بالتأجير طويل الأمد تشمل التجهيز والصيانة.',
      en: 'Integrated office furniture rental solutions including delivery and maintenance.',
    },
    rating: 4.4,
    hours: { ar: 'السبت – الخميس، 9:00 ص – 10:00 م', en: 'Sat – Thu, 9:00 AM – 10:00 PM' },
    logoTone: 'success',
    verified: false,
    branches: [
      {
        id: 'ro-sahafa',
        name: { ar: 'فرع الصحافة', en: 'Al Sahafa Branch' },
        address: { ar: 'شارع أنس بن مالك، الصحافة', en: 'Anas Ibn Malik St, Al Sahafa' },
        phone: '+966115556677',
        hours: { ar: '9:00 ص – 10:00 م', en: '9:00 AM – 10:00 PM' },
      },
    ],
  },
];

export type ScannedItem = {
  id: string;
  name: Localized;
  qty: number;
  unitValue: number;
  serial?: string;
};

export type ContractClause = {
  id: string;
  title: Localized;
  body: Localized;
};

export type ScannedPackage = {
  token: string;
  storeId: string;
  branchId: string;
  issuedAt: string;
  currency: 'SAR';
  rental: {
    title: Localized;
    purpose: Localized;
    pickupDate: string;
    returnDate: string;
    durationDays: number;
    pickupLocation: Localized;
  };
  items: ScannedItem[];
  fees: {
    rentalTotal: number;
    deposit: number;
    insurance: number;
    vat: number;
    grandTotal: number;
  };
  damages: {
    nonReturn: number;
    partialDamage: number;
    totalDamage: number;
    note: Localized;
  };
  contract: {
    reference: string;
    clauses: ContractClause[];
  };
  note: {
    reference: string;
    beneficiary: Localized;
    principal: number;
    dueDate: string;
    place: Localized;
    purpose: Localized;
  };
};

export const SEED_SCANS: ScannedPackage[] = [
  {
    token: 'RM-88231',
    storeId: 'riyadh-motors',
    branchId: 'rm-olaya',
    issuedAt: '2026-04-20',
    currency: 'SAR',
    rental: {
      title: {
        ar: 'تأجير سيارة تويوتا لاند كروزر 2024',
        en: 'Rental — Toyota Land Cruiser 2024',
      },
      purpose: {
        ar: 'تأجير مركبة للاستخدام الشخصي داخل المملكة',
        en: 'Personal vehicle rental within the Kingdom',
      },
      pickupDate: '2026-04-22',
      returnDate: '2026-05-22',
      durationDays: 30,
      pickupLocation: {
        ar: 'فرع العليا — طريق الملك فهد، الرياض',
        en: 'Olaya Branch — King Fahd Rd, Riyadh',
      },
    },
    items: [
      {
        id: 'itm-1',
        name: { ar: 'تويوتا لاند كروزر VXR 2024', en: 'Toyota Land Cruiser VXR 2024' },
        qty: 1,
        unitValue: 320000,
        serial: 'VIN-LC24-889231',
      },
      {
        id: 'itm-2',
        name: { ar: 'طقم إطارات احتياطية', en: 'Spare tire kit' },
        qty: 1,
        unitValue: 2400,
      },
      {
        id: 'itm-3',
        name: { ar: 'جهاز تتبع GPS', en: 'GPS tracker' },
        qty: 1,
        unitValue: 650,
      },
    ],
    fees: {
      rentalTotal: 9000,
      deposit: 2000,
      insurance: 450,
      vat: 1417,
      grandTotal: 12867,
    },
    damages: {
      nonReturn: 320000,
      partialDamage: 15000,
      totalDamage: 285000,
      note: {
        ar: 'المبالغ أعلاه هي الحد الأقصى المغطى بالسند لأمر في حال عدم الإرجاع أو الضرر.',
        en: 'The amounts above represent the maximum liabilities covered by the promissory note.',
      },
    },
    contract: {
      reference: 'CN-APX-2026-0412',
      clauses: [
        {
          id: 'c1',
          title: { ar: 'مدة العقد', en: 'Contract duration' },
          body: {
            ar: 'تسري هذه الاتفاقية لمدة 30 يوماً ميلادياً تبدأ من تاريخ التسليم ولا تُجدَّد تلقائياً.',
            en: 'This agreement runs for 30 calendar days from handover and does not auto-renew.',
          },
        },
        {
          id: 'c2',
          title: { ar: 'الاستخدام والمسؤولية', en: 'Use & liability' },
          body: {
            ar: 'يلتزم المستأجر باستخدام المركبة للغرض المصرّح به فقط ويتحمل كامل المسؤولية عن أي مخالفة أو استخدام غير مشروع.',
            en: 'The lessee shall use the vehicle only for its stated purpose and bears full responsibility for any violation or unlawful use.',
          },
        },
        {
          id: 'c3',
          title: { ar: 'التأمين والصيانة', en: 'Insurance & maintenance' },
          body: {
            ar: 'تشمل الباقة تأميناً شاملاً ضد الغير بحدّ أعلى محدد، ولا تشمل الأضرار الناتجة عن الإهمال.',
            en: 'The package includes comprehensive third-party insurance up to a defined cap; damages caused by negligence are excluded.',
          },
        },
        {
          id: 'c4',
          title: { ar: 'الإرجاع والتأخير', en: 'Return & late fees' },
          body: {
            ar: 'يجب إرجاع المركبة في الموعد المحدد وإلا تُحتسب غرامة يومية قدرها 5% من قيمة الإيجار الشهري.',
            en: 'The vehicle must be returned on the due date; otherwise a daily penalty of 5% of the monthly rent applies.',
          },
        },
        {
          id: 'c5',
          title: { ar: 'فسخ العقد', en: 'Termination' },
          body: {
            ar: 'يحق لأي طرف فسخ العقد بإشعار مكتوب مدته 7 أيام عمل، مع تسوية الالتزامات القائمة.',
            en: 'Either party may terminate by written notice of 7 business days, subject to settling outstanding obligations.',
          },
        },
      ],
    },
    note: {
      reference: 'PN-APX-2026-0412',
      beneficiary: { ar: 'معرض الرياض للسيارات', en: 'Riyadh Motors' },
      principal: 320000,
      dueDate: '2026-05-22',
      place: { ar: 'الرياض، المملكة العربية السعودية', en: 'Riyadh, Saudi Arabia' },
      purpose: {
        ar: 'ضمان إرجاع المركبة المؤجَّرة بحالتها التشغيلية.',
        en: 'Security for returning the rented vehicle in operating condition.',
      },
    },
  },
];

export type MerchantRentalCategory = 'car' | 'property' | 'equipment';
export type MerchantRentalStatus = 'active' | 'due-soon' | 'overdue' | 'returned';
export type MerchantRentalDocState = 'draft' | 'ready' | 'sent' | 'signed';
export type MerchantNafithState = 'pending' | 'submitted' | 'approved';
export type MerchantClosureStatus = 'active' | 'closed' | 'damaged';
export type MerchantRentalTimelineKey =
  | 'created'
  | 'customer-approved'
  | 'contract-ready'
  | 'note-ready'
  | 'nafith-submitted'
  | 'nafith-approved'
  | 'activated'
  | 'payment-received'
  | 'due-reminder'
  | 'returned';
export type MerchantRentalTimelineEvent = {
  key: MerchantRentalTimelineKey;
  at: string;
  note?: string;
};
export type MerchantRental = {
  id: string;
  customerName: string;
  customerInitials: string;
  customerCity: string;
  customerMobile: string;
  item: string;
  category: MerchantRentalCategory;
  branchId: string;
  startDate: string;
  endDate: string;
  nextDueDate: string;
  monthlyAmount: number;
  itemValue: number;
  liabilityTotal: number;
  paidInstallments: number;
  totalInstallments: number;
  status: MerchantRentalStatus;
  contractRef: string;
  noteRef: string;
  customerApproved: boolean;
  contractState: MerchantRentalDocState;
  noteState: MerchantRentalDocState;
  nafithState: MerchantNafithState;
  timeline: MerchantRentalTimelineEvent[];
  closureStatus?: MerchantClosureStatus;
  closedAt?: string;
  closureNotes?: string;
  damageCaseId?: string;
};

export type MerchantApprovalStage =
  | 'awaiting-customer'
  | 'awaiting-nafith'
  | 'awaiting-review';
export type MerchantApproval = {
  id: string;
  customerName: string;
  customerInitials: string;
  item: string;
  category: MerchantRentalCategory;
  amount: number;
  submittedAt: string;
  branchId: string;
  stage: MerchantApprovalStage;
};

export type MerchantDamageSeverity = 'partial' | 'total' | 'non-return';
export type MerchantDamageStatus = 'reported' | 'investigating' | 'settled';
export type MerchantDamageCase = {
  id: string;
  rentalId: string;
  customerName: string;
  customerInitials: string;
  item: string;
  severity: MerchantDamageSeverity;
  claimAmount: number;
  reportedAt: string;
  status: MerchantDamageStatus;
  notes?: string;
  evidence?: string[];
  contractRef?: string;
  noteRef?: string;
  invoiceRef?: string;
};

export type MerchantHistoryOutcome = 'completed' | 'cancelled' | 'defaulted';
export type MerchantHistoryRecord = {
  id: string;
  customerName: string;
  item: string;
  closedAt: string;
  totalAmount: number;
  outcome: MerchantHistoryOutcome;
};

export type MerchantCustomer = {
  id: string;
  fullName: string;
  initials: string;
  nationalId: string;
  mobile: string;
  email: string;
  city: string;
};

export const SEED_MERCHANT_CUSTOMERS: MerchantCustomer[] = [
  {
    id: 'cust-1',
    fullName: 'فهد بن عبدالله العتيبي',
    initials: 'FA',
    nationalId: '1098234567',
    mobile: '555012345',
    email: 'fahad.otaibi@example.com',
    city: 'riyadh',
  },
  {
    id: 'cust-2',
    fullName: 'سارة بنت محمد المطيري',
    initials: 'SM',
    nationalId: '1076543218',
    mobile: '556789012',
    email: 'sara.mutairi@example.com',
    city: 'riyadh',
  },
  {
    id: 'cust-3',
    fullName: 'عبدالرحمن بن سعد الشهري',
    initials: 'AS',
    nationalId: '1065432198',
    mobile: '554321098',
    email: 'a.shahri@example.com',
    city: 'jeddah',
  },
  {
    id: 'cust-4',
    fullName: 'نوف بنت فيصل القحطاني',
    initials: 'NQ',
    nationalId: '1054328761',
    mobile: '553210987',
    email: 'nouf.q@example.com',
    city: 'riyadh',
  },
  {
    id: 'cust-5',
    fullName: 'خالد بن سلمان الدوسري',
    initials: 'KD',
    nationalId: '1043876529',
    mobile: '559870123',
    email: 'khalid.dosari@example.com',
    city: 'dammam',
  },
  {
    id: 'cust-6',
    fullName: 'منى بنت عبدالعزيز الزهراني',
    initials: 'MZ',
    nationalId: '1032198745',
    mobile: '558765432',
    email: 'muna.z@example.com',
    city: 'jeddah',
  },
];

export const SEED_MERCHANT_RENTALS: MerchantRental[] = [
  {
    id: 'MR-2026-031',
    customerName: 'فهد العتيبي',
    customerInitials: 'FA',
    customerCity: 'riyadh',
    customerMobile: '555012345',
    item: 'تويوتا لاند كروزر 2024',
    category: 'car',
    branchId: 'rm-olaya',
    startDate: '2026-02-15',
    endDate: '2027-02-14',
    nextDueDate: '2026-04-25',
    monthlyAmount: 4800,
    itemValue: 320000,
    liabilityTotal: 285000,
    paidInstallments: 2,
    totalInstallments: 12,
    status: 'due-soon',
    contractRef: 'CN-APX-2026-0231',
    noteRef: 'PN-APX-2026-0231',
    customerApproved: true,
    contractState: 'signed',
    noteState: 'signed',
    nafithState: 'approved',
    timeline: [
      { key: 'created', at: '2026-02-12T09:15:00Z' },
      { key: 'customer-approved', at: '2026-02-13T16:40:00Z' },
      { key: 'contract-ready', at: '2026-02-14T08:10:00Z' },
      { key: 'note-ready', at: '2026-02-14T08:12:00Z' },
      { key: 'nafith-submitted', at: '2026-02-14T10:02:00Z' },
      { key: 'nafith-approved', at: '2026-02-15T07:48:00Z' },
      { key: 'activated', at: '2026-02-15T10:00:00Z' },
      { key: 'payment-received', at: '2026-03-25T11:20:00Z' },
      { key: 'due-reminder', at: '2026-04-20T07:00:00Z' },
    ],
  },
  {
    id: 'MR-2026-028',
    customerName: 'سارة المطيري',
    customerInitials: 'SM',
    customerCity: 'riyadh',
    customerMobile: '556789012',
    item: 'هوندا أكورد 2024',
    category: 'car',
    branchId: 'rm-olaya',
    startDate: '2026-01-05',
    endDate: '2027-01-04',
    nextDueDate: '2026-04-05',
    monthlyAmount: 2650,
    itemValue: 145000,
    liabilityTotal: 130000,
    paidInstallments: 2,
    totalInstallments: 12,
    status: 'overdue',
    contractRef: 'CN-APX-2026-0128',
    noteRef: 'PN-APX-2026-0128',
    customerApproved: true,
    contractState: 'signed',
    noteState: 'signed',
    nafithState: 'approved',
    timeline: [
      { key: 'created', at: '2026-01-02T08:00:00Z' },
      { key: 'customer-approved', at: '2026-01-03T14:25:00Z' },
      { key: 'contract-ready', at: '2026-01-04T09:00:00Z' },
      { key: 'note-ready', at: '2026-01-04T09:02:00Z' },
      { key: 'nafith-submitted', at: '2026-01-04T10:30:00Z' },
      { key: 'nafith-approved', at: '2026-01-05T07:30:00Z' },
      { key: 'activated', at: '2026-01-05T09:45:00Z' },
      { key: 'payment-received', at: '2026-02-05T12:00:00Z' },
      { key: 'due-reminder', at: '2026-04-03T07:00:00Z' },
    ],
  },
  {
    id: 'MR-2026-026',
    customerName: 'عبدالرحمن الشهري',
    customerInitials: 'AS',
    customerCity: 'jeddah',
    customerMobile: '554321098',
    item: 'نيسان باترول 2023',
    category: 'car',
    branchId: 'rm-malqa',
    startDate: '2025-12-20',
    endDate: '2026-12-19',
    nextDueDate: '2026-05-02',
    monthlyAmount: 3900,
    itemValue: 215000,
    liabilityTotal: 190000,
    paidInstallments: 4,
    totalInstallments: 12,
    status: 'active',
    contractRef: 'CN-APX-2025-1226',
    noteRef: 'PN-APX-2025-1226',
    customerApproved: true,
    contractState: 'signed',
    noteState: 'signed',
    nafithState: 'approved',
    timeline: [
      { key: 'created', at: '2025-12-18T10:00:00Z' },
      { key: 'customer-approved', at: '2025-12-18T18:30:00Z' },
      { key: 'contract-ready', at: '2025-12-19T08:00:00Z' },
      { key: 'note-ready', at: '2025-12-19T08:05:00Z' },
      { key: 'nafith-submitted', at: '2025-12-19T10:15:00Z' },
      { key: 'nafith-approved', at: '2025-12-20T07:55:00Z' },
      { key: 'activated', at: '2025-12-20T10:30:00Z' },
      { key: 'payment-received', at: '2026-04-02T13:10:00Z' },
    ],
  },
  {
    id: 'MR-2026-024',
    customerName: 'نوف القحطاني',
    customerInitials: 'NQ',
    customerCity: 'riyadh',
    customerMobile: '553210987',
    item: 'لكزس ES 2024',
    category: 'car',
    branchId: 'rm-olaya',
    startDate: '2026-03-08',
    endDate: '2027-03-07',
    nextDueDate: '2026-05-08',
    monthlyAmount: 5200,
    itemValue: 260000,
    liabilityTotal: 240000,
    paidInstallments: 1,
    totalInstallments: 12,
    status: 'active',
    contractRef: 'CN-APX-2026-0324',
    noteRef: 'PN-APX-2026-0324',
    customerApproved: true,
    contractState: 'signed',
    noteState: 'ready',
    nafithState: 'submitted',
    timeline: [
      { key: 'created', at: '2026-03-05T09:00:00Z' },
      { key: 'customer-approved', at: '2026-03-06T11:15:00Z' },
      { key: 'contract-ready', at: '2026-03-07T08:00:00Z' },
      { key: 'note-ready', at: '2026-03-07T08:02:00Z' },
      { key: 'nafith-submitted', at: '2026-03-07T10:20:00Z' },
      { key: 'activated', at: '2026-03-08T10:00:00Z' },
    ],
  },
  {
    id: 'MR-2026-019',
    customerName: 'خالد الدوسري',
    customerInitials: 'KD',
    customerCity: 'riyadh',
    customerMobile: '559870123',
    item: 'كيا سبورتاج 2023',
    category: 'car',
    branchId: 'rm-malqa',
    startDate: '2025-10-15',
    endDate: '2026-10-14',
    nextDueDate: '2026-04-15',
    monthlyAmount: 2100,
    itemValue: 110000,
    liabilityTotal: 95000,
    paidInstallments: 6,
    totalInstallments: 12,
    status: 'overdue',
    contractRef: 'CN-APX-2025-1019',
    noteRef: 'PN-APX-2025-1019',
    customerApproved: true,
    contractState: 'signed',
    noteState: 'signed',
    nafithState: 'approved',
    timeline: [
      { key: 'created', at: '2025-10-13T09:45:00Z' },
      { key: 'customer-approved', at: '2025-10-13T17:00:00Z' },
      { key: 'contract-ready', at: '2025-10-14T08:00:00Z' },
      { key: 'note-ready', at: '2025-10-14T08:03:00Z' },
      { key: 'nafith-submitted', at: '2025-10-14T09:30:00Z' },
      { key: 'nafith-approved', at: '2025-10-15T07:40:00Z' },
      { key: 'activated', at: '2025-10-15T10:15:00Z' },
      { key: 'payment-received', at: '2026-03-15T11:00:00Z' },
      { key: 'due-reminder', at: '2026-04-13T07:00:00Z' },
    ],
  },
  {
    id: 'MR-2026-015',
    customerName: 'منى الزهراني',
    customerInitials: 'MZ',
    customerCity: 'riyadh',
    customerMobile: '558765432',
    item: 'فورد إكسبلورر 2023',
    category: 'car',
    branchId: 'rm-olaya',
    startDate: '2025-09-01',
    endDate: '2026-08-31',
    nextDueDate: '2026-05-01',
    monthlyAmount: 3450,
    itemValue: 180000,
    liabilityTotal: 160000,
    paidInstallments: 7,
    totalInstallments: 12,
    status: 'active',
    contractRef: 'CN-APX-2025-0915',
    noteRef: 'PN-APX-2025-0915',
    customerApproved: true,
    contractState: 'signed',
    noteState: 'signed',
    nafithState: 'approved',
    timeline: [
      { key: 'created', at: '2025-08-30T10:00:00Z' },
      { key: 'customer-approved', at: '2025-08-30T16:20:00Z' },
      { key: 'contract-ready', at: '2025-08-31T08:30:00Z' },
      { key: 'note-ready', at: '2025-08-31T08:32:00Z' },
      { key: 'nafith-submitted', at: '2025-08-31T10:00:00Z' },
      { key: 'nafith-approved', at: '2025-09-01T07:25:00Z' },
      { key: 'activated', at: '2025-09-01T09:30:00Z' },
      { key: 'payment-received', at: '2026-04-01T12:15:00Z' },
    ],
  },
];

export const SEED_MERCHANT_APPROVALS: MerchantApproval[] = [
  {
    id: 'MA-2026-041',
    customerName: 'ياسر السبيعي',
    customerInitials: 'YS',
    item: 'تويوتا كامري 2024',
    category: 'car',
    amount: 2450,
    submittedAt: '2026-04-19',
    branchId: 'rm-olaya',
    stage: 'awaiting-nafith',
  },
  {
    id: 'MA-2026-040',
    customerName: 'دانة الحربي',
    customerInitials: 'DH',
    item: 'لكزس NX 2024',
    category: 'car',
    amount: 3800,
    submittedAt: '2026-04-18',
    branchId: 'rm-malqa',
    stage: 'awaiting-customer',
  },
  {
    id: 'MA-2026-039',
    customerName: 'سلطان الغامدي',
    customerInitials: 'SG',
    item: 'نيسان ألتيما 2023',
    category: 'car',
    amount: 2100,
    submittedAt: '2026-04-17',
    branchId: 'rm-olaya',
    stage: 'awaiting-review',
  },
];

export const SEED_MERCHANT_DAMAGES: MerchantDamageCase[] = [
  {
    id: 'DM-2026-007',
    rentalId: 'MR-2026-028',
    customerName: 'سارة المطيري',
    customerInitials: 'SM',
    item: 'هوندا أكورد 2024',
    severity: 'partial',
    claimAmount: 8400,
    reportedAt: '2026-04-10',
    status: 'investigating',
    notes: 'خدوش عميقة على الجانب الأيمن وكسر في المرآة الجانبية.',
    contractRef: 'CN-APX-2026-0128',
    noteRef: 'PN-APX-2026-0128',
    invoiceRef: 'INV-APX-2026-0128-04',
  },
  {
    id: 'DM-2026-005',
    rentalId: 'MR-2025-112',
    customerName: 'عبدالله الشمري',
    customerInitials: 'AS',
    item: 'كيا سورنتو 2023',
    severity: 'non-return',
    claimAmount: 145000,
    reportedAt: '2026-03-28',
    status: 'reported',
    notes: 'المستأجر لم يُعِد المركبة رغم انتهاء مدة العقد وتعذّر التواصل معه.',
    contractRef: 'CN-APX-2025-1112',
    noteRef: 'PN-APX-2025-1112',
    invoiceRef: 'INV-APX-2025-1112-03',
  },
  {
    id: 'DM-2026-002',
    rentalId: 'MR-2025-088',
    customerName: 'ريم الأحمدي',
    customerInitials: 'RA',
    item: 'تويوتا راف فور 2023',
    severity: 'partial',
    claimAmount: 3100,
    reportedAt: '2026-02-14',
    status: 'settled',
    notes: 'تم تسوية قيمة الأضرار بالتراضي عبر التأمين.',
    contractRef: 'CN-APX-2025-0988',
    noteRef: 'PN-APX-2025-0988',
    invoiceRef: 'INV-APX-2025-0988-06',
  },
];

export const SEED_MERCHANT_HISTORY: MerchantHistoryRecord[] = [
  {
    id: 'MH-2025-118',
    customerName: 'ماجد القرني',
    item: 'هيونداي سوناتا 2023',
    closedAt: '2026-03-22',
    totalAmount: 24600,
    outcome: 'completed',
  },
  {
    id: 'MH-2025-102',
    customerName: 'لمى العنزي',
    item: 'مازدا CX-9 2022',
    closedAt: '2026-02-05',
    totalAmount: 31200,
    outcome: 'completed',
  },
  {
    id: 'MH-2025-091',
    customerName: 'ناصر الشمري',
    item: 'جي إم سي يوكن 2022',
    closedAt: '2025-12-18',
    totalAmount: 28800,
    outcome: 'defaulted',
  },
  {
    id: 'MH-2025-077',
    customerName: 'جواهر العمري',
    item: 'فورد تورس 2022',
    closedAt: '2025-11-02',
    totalAmount: 18400,
    outcome: 'cancelled',
  },
];

export const SEED_HISTORY: HistoryItem[] = [
  {
    id: 'HS-2025-011',
    title: 'هيونداي توسان 2023',
    counterparty: 'وكالة الجزيرة',
    closedAt: '2025-12-30',
    amount: 26400,
    status: 'completed',
  },
  {
    id: 'HS-2025-007',
    title: 'شقة سكنية — حي العليا',
    counterparty: 'مؤسسة الأفق العقارية',
    closedAt: '2025-09-10',
    amount: 48000,
    status: 'completed',
  },
  {
    id: 'HS-2024-003',
    title: 'سيارة نيسان التيما 2022',
    counterparty: 'وكالة الشرق',
    closedAt: '2024-11-02',
    amount: 22000,
    status: 'closed',
  },
];

/* ========================= Admin ========================= */

export type AdminMerchantBranch = {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string;
};

export type AdminMerchantDocStatus = 'verified' | 'pending' | 'missing';
export type AdminMerchantDocs = {
  commercialReg: AdminMerchantDocStatus;
  vat: AdminMerchantDocStatus;
  bankLetter: AdminMerchantDocStatus;
  authorizedId: AdminMerchantDocStatus;
};

export type AdminPendingMerchant = {
  id: string;
  companyName: string;
  authorizedName: string;
  authorizedId: string;
  commercialReg: string;
  vatNumber: string;
  iban: string;
  contactEmail: string;
  contactPhone: string;
  city: string;
  address: string;
  category: 'cars' | 'real-estate' | 'electronics' | 'furniture' | 'tools';
  expectedVolume: number;
  submittedAt: string;
  initials: string;
  branches: AdminMerchantBranch[];
  docs: AdminMerchantDocs;
  notes?: string;
};

export const SEED_ADMIN_PENDING_MERCHANTS: AdminPendingMerchant[] = [
  {
    id: 'MRC-PEND-104',
    companyName: 'شركة الرحال لتأجير السيارات',
    authorizedName: 'فيصل العتيبي',
    authorizedId: '1099887766',
    commercialReg: '1010412388',
    vatNumber: '300123456700003',
    iban: 'SA03 8000 0000 6080 1016 7519',
    contactEmail: 'finance@alrahhal.sa',
    contactPhone: '0551234567',
    city: 'الرياض',
    address: 'حي الملقا — طريق الأمير محمد بن سعد',
    category: 'cars',
    expectedVolume: 180000,
    submittedAt: '2026-04-19T09:12:00+03:00',
    initials: 'ش ر',
    branches: [
      {
        id: 'BR-RUH-01',
        name: 'فرع الرياض الرئيسي',
        city: 'الرياض',
        address: 'حي الملقا — طريق الأمير محمد بن سعد',
        phone: '0114567890',
      },
      {
        id: 'BR-JED-01',
        name: 'فرع جدة',
        city: 'جدة',
        address: 'حي الروضة — طريق فلسطين',
        phone: '0126789012',
      },
    ],
    docs: {
      commercialReg: 'verified',
      vat: 'verified',
      bankLetter: 'verified',
      authorizedId: 'verified',
    },
  },
  {
    id: 'MRC-PEND-103',
    companyName: 'مؤسسة البيت الحديث للأثاث',
    authorizedName: 'نوف الحربي',
    authorizedId: '1077665544',
    commercialReg: '4030288120',
    vatNumber: '300987654300003',
    iban: 'SA44 4000 0000 1234 5678 9012',
    contactEmail: 'admin@bayt-alhadeeth.com',
    contactPhone: '0556677889',
    city: 'جدة',
    address: 'حي الزهراء — شارع الأمير سلطان',
    category: 'furniture',
    expectedVolume: 95000,
    submittedAt: '2026-04-18T14:43:00+03:00',
    initials: 'م ب',
    branches: [
      {
        id: 'BR-JED-FUR',
        name: 'الفرع الرئيسي',
        city: 'جدة',
        address: 'حي الزهراء — شارع الأمير سلطان',
        phone: '0126112233',
      },
    ],
    docs: {
      commercialReg: 'verified',
      vat: 'verified',
      bankLetter: 'pending',
      authorizedId: 'verified',
    },
  },
  {
    id: 'MRC-PEND-102',
    companyName: 'دار التقنية لتأجير المعدات',
    authorizedName: 'سلطان القحطاني',
    authorizedId: '1066554433',
    commercialReg: '2055011733',
    vatNumber: '300555444300003',
    iban: 'SA12 1000 0000 9988 7766 5544',
    contactEmail: 'ops@dar-tech.sa',
    contactPhone: '0509988776',
    city: 'الدمام',
    address: 'حي الشاطئ الغربي — طريق الكورنيش',
    category: 'electronics',
    expectedVolume: 62000,
    submittedAt: '2026-04-17T11:02:00+03:00',
    initials: 'د ت',
    branches: [
      {
        id: 'BR-DMM-TECH',
        name: 'فرع الدمام',
        city: 'الدمام',
        address: 'حي الشاطئ الغربي',
        phone: '0138001234',
      },
    ],
    docs: {
      commercialReg: 'verified',
      vat: 'pending',
      bankLetter: 'verified',
      authorizedId: 'verified',
    },
  },
  {
    id: 'MRC-PEND-101',
    companyName: 'مجموعة صُهبة السكنية',
    authorizedName: 'منيرة الزهراني',
    authorizedId: '1055443322',
    commercialReg: '1010509274',
    vatNumber: '300333222100003',
    iban: 'SA77 2000 0000 3344 5566 7788',
    contactEmail: 'leasing@suhba-living.com',
    contactPhone: '0533322211',
    city: 'الرياض',
    address: 'حي الياسمين — طريق الإمام سعود',
    category: 'real-estate',
    expectedVolume: 240000,
    submittedAt: '2026-04-16T16:20:00+03:00',
    initials: 'م ص',
    branches: [
      {
        id: 'BR-RUH-RE-01',
        name: 'فرع الياسمين',
        city: 'الرياض',
        address: 'حي الياسمين',
        phone: '0114002211',
      },
      {
        id: 'BR-RUH-RE-02',
        name: 'فرع النرجس',
        city: 'الرياض',
        address: 'حي النرجس',
        phone: '0114003322',
      },
      {
        id: 'BR-RUH-RE-03',
        name: 'فرع قرطبة',
        city: 'الرياض',
        address: 'حي قرطبة',
        phone: '0114004433',
      },
    ],
    docs: {
      commercialReg: 'verified',
      vat: 'verified',
      bankLetter: 'verified',
      authorizedId: 'pending',
    },
  },
];

export type AdminMerchantDecisionStatus = 'pending' | 'approved' | 'rejected';
export type AdminMerchantDecision = {
  status: AdminMerchantDecisionStatus;
  decidedAt: string;
  notes?: string;
  reviewer?: string;
};

export type AdminUsersSummary = {
  totalUsers: number;
  verifiedUsers: number;
  newThisMonth: number;
  suspended: number;
  monthlyTrend: number; // %
};

export const SEED_ADMIN_USERS: AdminUsersSummary = {
  totalUsers: 18420,
  verifiedUsers: 17255,
  newThisMonth: 642,
  suspended: 38,
  monthlyTrend: 4.2,
};

export type AdminMerchantsSummary = {
  totalActive: number;
  pending: number;
  suspended: number;
};

export const SEED_ADMIN_MERCHANTS: AdminMerchantsSummary = {
  totalActive: 312,
  pending: 4,
  suspended: 7,
};

export type AdminLimitsSummary = {
  totalCap: number;
  allocated: number;
  utilization: number; // 0..1
  merchantsAtCap: number;
  pendingRequests: number;
  avgLimitPerUser: number;
};

export const SEED_ADMIN_LIMITS: AdminLimitsSummary = {
  totalCap: 42_500_000,
  allocated: 31_180_000,
  utilization: 0.7336,
  merchantsAtCap: 6,
  pendingRequests: 11,
  avgLimitPerUser: 24_000,
};

export type AdminCaseSeverity = 'partial' | 'total' | 'non-return';
export type AdminCaseStage = 'review' | 'settlement' | 'nafith' | 'execution';
export type AdminActiveCase = {
  id: string;
  merchantName: string;
  customerName: string;
  customerInitials: string;
  item: string;
  severity: AdminCaseSeverity;
  stage: AdminCaseStage;
  claimAmount: number;
  reportedAt: string;
};

export const SEED_ADMIN_ACTIVE_CASES: AdminActiveCase[] = [
  {
    id: 'DM-2026-118',
    merchantName: 'تأجير الشرق',
    customerName: 'عبدالله الشمري',
    customerInitials: 'ع ش',
    item: 'تويوتا كامري 2024',
    severity: 'non-return',
    stage: 'nafith',
    claimAmount: 78000,
    reportedAt: '2026-04-11T10:15:00+03:00',
  },
  {
    id: 'DM-2026-117',
    merchantName: 'مفروشات الديوان',
    customerName: 'هناء الدوسري',
    customerInitials: 'ه د',
    item: 'طقم جلوس — مودرن ٨ قطع',
    severity: 'partial',
    stage: 'settlement',
    claimAmount: 6200,
    reportedAt: '2026-04-14T13:40:00+03:00',
  },
  {
    id: 'DM-2026-116',
    merchantName: 'تأجير النخبة',
    customerName: 'بدر العنزي',
    customerInitials: 'ب ع',
    item: 'جيب لاندكروزر 2023',
    severity: 'total',
    stage: 'execution',
    claimAmount: 245000,
    reportedAt: '2026-04-02T08:30:00+03:00',
  },
  {
    id: 'DM-2026-115',
    merchantName: 'تأجير السلام',
    customerName: 'ريم القحطاني',
    customerInitials: 'ر ق',
    item: 'لابتوب ماك برو 16',
    severity: 'partial',
    stage: 'review',
    claimAmount: 4800,
    reportedAt: '2026-04-18T09:00:00+03:00',
  },
];

export type AdminOverdueBucket = '1-7' | '8-30' | '31-60' | '60+';
export type AdminOverdueCase = {
  id: string;
  merchantName: string;
  customerName: string;
  customerInitials: string;
  item: string;
  daysOverdue: number;
  amount: number;
  bucket: AdminOverdueBucket;
};

export const SEED_ADMIN_OVERDUE: AdminOverdueCase[] = [
  {
    id: 'CN-APX-9821',
    merchantName: 'تأجير الشرق',
    customerName: 'ماجد الحربي',
    customerInitials: 'م ح',
    item: 'تويوتا هايلوكس 2023',
    daysOverdue: 4,
    amount: 3100,
    bucket: '1-7',
  },
  {
    id: 'CN-APX-9733',
    merchantName: 'مفروشات الديوان',
    customerName: 'أمل السبيعي',
    customerInitials: 'أ س',
    item: 'غرفة نوم كلاسيك',
    daysOverdue: 12,
    amount: 1850,
    bucket: '8-30',
  },
  {
    id: 'CN-APX-9688',
    merchantName: 'تأجير النخبة',
    customerName: 'خالد المطيري',
    customerInitials: 'خ م',
    item: 'لكزس ES 2022',
    daysOverdue: 38,
    amount: 4700,
    bucket: '31-60',
  },
  {
    id: 'CN-APX-9571',
    merchantName: 'تأجير السلام',
    customerName: 'وضحى الرشيدي',
    customerInitials: 'و ر',
    item: 'كيا سورينتو 2022',
    daysOverdue: 74,
    amount: 6050,
    bucket: '60+',
  },
];

export type AdminOverdueBucketCount = {
  bucket: AdminOverdueBucket;
  count: number;
  amount: number;
};

export const SEED_ADMIN_OVERDUE_BUCKETS: AdminOverdueBucketCount[] = [
  { bucket: '1-7', count: 41, amount: 128400 },
  { bucket: '8-30', count: 27, amount: 89200 },
  { bucket: '31-60', count: 12, amount: 58700 },
  { bucket: '60+', count: 5, amount: 37200 },
];

/* ================ Admin user management ================ */

export type AdminUserStatus = 'active' | 'suspended' | 'pending';
export type AdminUserRiskTier = 'standard' | 'gold' | 'watch';

export type AdminUserActivityType =
  | 'rental'
  | 'payment'
  | 'verification'
  | 'contract'
  | 'return'
  | 'support';

export type AdminUserActivity = {
  id: string;
  type: AdminUserActivityType;
  title: string;
  merchantName?: string;
  amount?: number;
  at: string;
};

export type AdminUserRecord = {
  id: string;
  fullName: string;
  initials: string;
  nationalId: string;
  mobile: string;
  email: string;
  city: string;
  status: AdminUserStatus;
  nafathVerified: boolean;
  createdAt: string;
  lastActiveAt: string;
  eligibilityLimit: number;
  usedAmount: number;
  activeRentals: number;
  completedRentals: number;
  riskTier: AdminUserRiskTier;
  activity: AdminUserActivity[];
};

export const SEED_ADMIN_USERS_LIST: AdminUserRecord[] = [
  {
    id: 'USR-204118',
    fullName: 'سارة الحمود',
    initials: 'س ح',
    nationalId: '1098234567',
    mobile: '0551122334',
    email: 'sara.hamoud@gmail.com',
    city: 'الرياض',
    status: 'active',
    nafathVerified: true,
    createdAt: '2025-08-12T09:20:00+03:00',
    lastActiveAt: '2026-04-20T18:42:00+03:00',
    eligibilityLimit: 35000,
    usedAmount: 22500,
    activeRentals: 2,
    completedRentals: 7,
    riskTier: 'gold',
    activity: [
      {
        id: 'ACT-S-01',
        type: 'rental',
        title: 'تويوتا كامري 2025',
        merchantName: 'وكالة الشرق',
        amount: 14500,
        at: '2026-04-14T10:12:00+03:00',
      },
      {
        id: 'ACT-S-02',
        type: 'payment',
        title: 'سداد قسط شهري',
        amount: 2100,
        at: '2026-04-10T12:00:00+03:00',
      },
      {
        id: 'ACT-S-03',
        type: 'contract',
        title: 'توقيع عقد CN-APX-9912',
        merchantName: 'وكالة الشرق',
        at: '2026-04-14T10:15:00+03:00',
      },
      {
        id: 'ACT-S-04',
        type: 'return',
        title: 'إرجاع طقم جلوس',
        merchantName: 'مفروشات الديوان',
        at: '2026-03-29T16:44:00+03:00',
      },
    ],
  },
  {
    id: 'USR-204077',
    fullName: 'خالد السبيعي',
    initials: 'خ س',
    nationalId: '1076554321',
    mobile: '0538877665',
    email: 'k.subaie@outlook.com',
    city: 'جدة',
    status: 'active',
    nafathVerified: true,
    createdAt: '2024-11-03T14:10:00+03:00',
    lastActiveAt: '2026-04-19T22:14:00+03:00',
    eligibilityLimit: 18000,
    usedAmount: 5200,
    activeRentals: 1,
    completedRentals: 12,
    riskTier: 'standard',
    activity: [
      {
        id: 'ACT-K-01',
        type: 'rental',
        title: 'غسّالة LG 14 كجم',
        merchantName: 'إلكترونيات المستقبل',
        amount: 5200,
        at: '2026-04-05T09:45:00+03:00',
      },
      {
        id: 'ACT-K-02',
        type: 'payment',
        title: 'سداد مبكّر',
        amount: 1400,
        at: '2026-03-28T14:30:00+03:00',
      },
      {
        id: 'ACT-K-03',
        type: 'verification',
        title: 'تحديث بيانات نفاذ',
        at: '2026-02-18T11:00:00+03:00',
      },
    ],
  },
  {
    id: 'USR-204022',
    fullName: 'نورة العنزي',
    initials: 'ن ع',
    nationalId: '1088776655',
    mobile: '0544455667',
    email: 'noura.anizi@proton.me',
    city: 'الدمام',
    status: 'active',
    nafathVerified: true,
    createdAt: '2024-06-20T08:05:00+03:00',
    lastActiveAt: '2026-04-18T07:56:00+03:00',
    eligibilityLimit: 60000,
    usedAmount: 47300,
    activeRentals: 3,
    completedRentals: 21,
    riskTier: 'gold',
    activity: [
      {
        id: 'ACT-N-01',
        type: 'rental',
        title: 'جيب لاندكروزر 2024',
        merchantName: 'تأجير النخبة',
        amount: 28000,
        at: '2026-04-09T17:22:00+03:00',
      },
      {
        id: 'ACT-N-02',
        type: 'rental',
        title: 'شقة مفروشة — الخبر',
        merchantName: 'مجموعة صُهبة',
        amount: 13500,
        at: '2026-03-21T12:00:00+03:00',
      },
      {
        id: 'ACT-N-03',
        type: 'payment',
        title: 'سداد قسط',
        amount: 3800,
        at: '2026-04-12T18:10:00+03:00',
      },
      {
        id: 'ACT-N-04',
        type: 'contract',
        title: 'توقيع عقد CN-APX-9834',
        merchantName: 'تأجير النخبة',
        at: '2026-04-09T17:25:00+03:00',
      },
    ],
  },
  {
    id: 'USR-203988',
    fullName: 'فهد الدوسري',
    initials: 'ف د',
    nationalId: '1066998877',
    mobile: '0501234987',
    email: 'fahad.d@gmail.com',
    city: 'الرياض',
    status: 'suspended',
    nafathVerified: true,
    createdAt: '2025-01-18T13:35:00+03:00',
    lastActiveAt: '2026-03-11T09:18:00+03:00',
    eligibilityLimit: 12000,
    usedAmount: 9600,
    activeRentals: 1,
    completedRentals: 3,
    riskTier: 'watch',
    activity: [
      {
        id: 'ACT-F-01',
        type: 'support',
        title: 'تذكرة دعم: تأخر سداد',
        at: '2026-03-10T15:20:00+03:00',
      },
      {
        id: 'ACT-F-02',
        type: 'rental',
        title: 'تلفزيون سامسونج 65"',
        merchantName: 'إلكترونيات المستقبل',
        amount: 4800,
        at: '2026-02-05T11:05:00+03:00',
      },
      {
        id: 'ACT-F-03',
        type: 'payment',
        title: 'سداد قسط',
        amount: 1200,
        at: '2026-01-28T10:10:00+03:00',
      },
    ],
  },
  {
    id: 'USR-203901',
    fullName: 'ريما الغامدي',
    initials: 'ر غ',
    nationalId: '1077887799',
    mobile: '0569988771',
    email: 'reema.g@applux.sa',
    city: 'مكة',
    status: 'active',
    nafathVerified: true,
    createdAt: '2025-10-02T16:45:00+03:00',
    lastActiveAt: '2026-04-21T06:12:00+03:00',
    eligibilityLimit: 22000,
    usedAmount: 0,
    activeRentals: 0,
    completedRentals: 4,
    riskTier: 'standard',
    activity: [
      {
        id: 'ACT-R-01',
        type: 'return',
        title: 'إرجاع ثلاجة LG 600L',
        merchantName: 'إلكترونيات المستقبل',
        at: '2026-03-02T19:00:00+03:00',
      },
      {
        id: 'ACT-R-02',
        type: 'verification',
        title: 'توثيق نفاذ',
        at: '2025-10-02T16:55:00+03:00',
      },
    ],
  },
  {
    id: 'USR-203820',
    fullName: 'سلطان القرني',
    initials: 'س ق',
    nationalId: '1099112233',
    mobile: '0511224455',
    email: 'sultan.qarni@outlook.com',
    city: 'تبوك',
    status: 'pending',
    nafathVerified: false,
    createdAt: '2026-04-17T08:30:00+03:00',
    lastActiveAt: '2026-04-17T08:35:00+03:00',
    eligibilityLimit: 0,
    usedAmount: 0,
    activeRentals: 0,
    completedRentals: 0,
    riskTier: 'standard',
    activity: [
      {
        id: 'ACT-SQ-01',
        type: 'verification',
        title: 'بدء تسجيل الحساب',
        at: '2026-04-17T08:30:00+03:00',
      },
    ],
  },
  {
    id: 'USR-203714',
    fullName: 'هند الزهراني',
    initials: 'ه ز',
    nationalId: '1055223344',
    mobile: '0578899112',
    email: 'hind.z@gmail.com',
    city: 'الطائف',
    status: 'active',
    nafathVerified: true,
    createdAt: '2024-04-11T09:00:00+03:00',
    lastActiveAt: '2026-04-17T21:03:00+03:00',
    eligibilityLimit: 28000,
    usedAmount: 11200,
    activeRentals: 1,
    completedRentals: 15,
    riskTier: 'standard',
    activity: [
      {
        id: 'ACT-H-01',
        type: 'rental',
        title: 'هيونداي توسان 2024',
        merchantName: 'تأجير السلام',
        amount: 11200,
        at: '2026-04-01T10:30:00+03:00',
      },
      {
        id: 'ACT-H-02',
        type: 'payment',
        title: 'سداد قسط',
        amount: 2400,
        at: '2026-04-15T12:45:00+03:00',
      },
    ],
  },
  {
    id: 'USR-203566',
    fullName: 'ماجد العتيبي',
    initials: 'م ع',
    nationalId: '1044556677',
    mobile: '0599884422',
    email: 'majed.o@icloud.com',
    city: 'الرياض',
    status: 'suspended',
    nafathVerified: true,
    createdAt: '2024-02-05T14:20:00+03:00',
    lastActiveAt: '2025-12-14T16:40:00+03:00',
    eligibilityLimit: 0,
    usedAmount: 3400,
    activeRentals: 0,
    completedRentals: 2,
    riskTier: 'watch',
    activity: [
      {
        id: 'ACT-M-01',
        type: 'support',
        title: 'إيقاف الحساب لمخالفة الشروط',
        at: '2025-12-15T09:00:00+03:00',
      },
      {
        id: 'ACT-M-02',
        type: 'rental',
        title: 'طقم ضيافة',
        merchantName: 'مفروشات الديوان',
        amount: 3400,
        at: '2025-11-02T11:00:00+03:00',
      },
    ],
  },
];
