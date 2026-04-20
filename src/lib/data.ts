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
