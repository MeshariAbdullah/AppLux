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
  /** Merchant display name in the active locale. Populated by
   *  adapters when a merchant lookup is available; '' otherwise. */
  counterparty?: string;
  /** The invoice's one-time scan token. Routes the customer into
   *  the review wizard at /review/<scanToken>. Populated by
   *  adaptInvoice when a Supabase row is available. */
  scanToken?: string | null;
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
  /** Storage object key. Set after the customer records the handover
   *  photo via record_contract_handover. Optional for the demo store
   *  shape; live mode always populates from rental_contracts. */
  handoverPhotoPath?: string | null;
  handoverAt?: string | null;
  /** When the customer confirmed the mandatory receipt photos taken
   *  inside the guided acceptance flow (Bugs 17/19). Optional for the
   *  demo store shape; live mode populates from rental_contracts. */
  receiptPhotosConfirmedAt?: string | null;
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
  assignedBy: 'Lend',
  assignedAt: '2026-03-14',
};

export const SEED_INVOICES: Invoice[] = [
  {
    id: 'inv-1042',
    title: 'فاتورة تأجير — فستان سهرة لافاندير',
    contractRef: 'CN-2026-018',
    issuedAt: '2026-04-01',
    dueDate: '2026-04-25',
    amount: 1850,
    status: 'due',
  },
  {
    id: 'inv-1041',
    title: 'فاتورة عربون — حقيبة أكرا آيكن',
    contractRef: 'CN-2026-018',
    issuedAt: '2026-03-01',
    dueDate: '2026-03-25',
    amount: 3200,
    status: 'overdue',
  },
  {
    id: 'inv-1039',
    title: 'فاتورة تنظيف وتلميع — بشت الأمراء',
    contractRef: 'CN-2026-012',
    issuedAt: '2026-04-08',
    dueDate: '2026-04-30',
    amount: 420,
    status: 'due',
  },
];

export const SEED_CONTRACTS: Contract[] = [
  {
    id: 'CN-2026-018',
    title: 'فستان سهرة لافاندير — مقاس 40',
    counterparty: 'دار ميزون دو سواريه',
    startDate: '2026-04-18',
    endDate: '2026-04-23',
    monthlyAmount: 1850,
    status: 'active',
  },
  {
    id: 'CN-2026-012',
    title: 'بشت الأمراء — صوف إيطالي مطرّز',
    counterparty: 'دار الأناقة للبشوت',
    startDate: '2026-04-10',
    endDate: '2026-04-14',
    monthlyAmount: 1200,
    status: 'active',
  },
  {
    id: 'CN-2026-024',
    title: 'ساعة أوريون السويسرية — كرونوغراف',
    counterparty: 'تيمبو لتأجير الساعات',
    startDate: '2026-04-22',
    endDate: '2026-04-29',
    monthlyAmount: 2900,
    status: 'pending',
  },
];

export const SEED_NOTES: PromissoryNote[] = [
  {
    id: 'PN-0084',
    reference: 'SN-2026-084',
    counterparty: 'دار ميزون دو سواريه',
    amount: 18500,
    dueDate: '2026-04-23',
    status: 'signed',
  },
  {
    id: 'PN-0087',
    reference: 'SN-2026-087',
    counterparty: 'تيمبو لتأجير الساعات',
    amount: 95000,
    dueDate: '2026-04-29',
    status: 'pending',
  },
];

export type Localized = { ar: string; en: string };

export type StoreCategory = 'dresses' | 'bags' | 'watches' | 'bishts';

/** Rich per-item attributes shown on the invoice/review/case screens
 *  (e.g. brand, size, color, condition). Each entry is a small labelled
 *  fact that helps the customer verify the actual piece they are about
 *  to sign for. */
export type ItemAttribute = {
  label: Localized;
  value: Localized;
};

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
    name: { ar: 'ميزون دو سواريه', en: 'Maison de Soirée' },
    initials: 'MS',
    category: 'dresses',
    city: 'riyadh',
    location: { ar: 'حي العليا، بوليفارد لكجري', en: 'Olaya District, Luxury Boulevard' },
    description: {
      ar: 'بوتيك تأجير فساتين السهرة والزفاف — تصاميم حصرية بمواسم جديدة كل 6 أسابيع، خدمة قياس خاصة داخل البوتيك.',
      en: 'An evening-wear and bridal rental house — curated designer collections refreshed every 6 weeks, with private fittings at the boutique.',
    },
    rating: 4.9,
    hours: { ar: 'السبت – الخميس، 11:00 ص – 11:00 م', en: 'Sat – Thu, 11:00 AM – 11:00 PM' },
    logoTone: 'brand',
    verified: true,
    branches: [
      {
        id: 'rm-olaya',
        name: { ar: 'فرع العليا', en: 'Olaya Atelier' },
        address: { ar: 'بوليفارد لكجري، العليا، الرياض', en: 'Luxury Blvd, Olaya, Riyadh' },
        phone: '+966112345671',
        hours: { ar: '11:00 ص – 11:00 م', en: '11:00 AM – 11:00 PM' },
      },
      {
        id: 'rm-malqa',
        name: { ar: 'صالون الملقا الخاص', en: 'Al Malqa Private Salon' },
        address: {
          ar: 'بوليفارد الدرة، الملقا، الرياض',
          en: 'Al Durra Blvd, Al Malqa, Riyadh',
        },
        phone: '+966112345672',
        hours: { ar: 'بحجز مسبق فقط', en: 'By appointment only' },
      },
    ],
  },
  {
    id: 'jazira-auto',
    name: { ar: 'فيلا كوتور للمناسبات', en: 'Villa Couture Occasions' },
    initials: 'VC',
    category: 'dresses',
    city: 'jeddah',
    location: { ar: 'حي الروضة، ممشى الأناقة', en: 'Al Rawdah, Elegance Walk' },
    description: {
      ar: 'بوتيك فساتين المناسبات الراقية — تشكيلة مختارة من دور الأزياء العالمية مع خدمة الترميم والتنظيف الفاخر بعد كل إيجار.',
      en: 'An occasion couture boutique featuring international designer pieces — with expert restoration and luxury cleaning after every rental.',
    },
    rating: 4.7,
    hours: { ar: 'يومياً، 12:00 ظ – 11:00 م', en: 'Daily, 12:00 PM – 11:00 PM' },
    logoTone: 'ink',
    verified: true,
    branches: [
      {
        id: 'ja-rawdah',
        name: { ar: 'صالون الروضة', en: 'Al Rawdah Salon' },
        address: {
          ar: 'ممشى الأناقة، الروضة، جدة',
          en: 'Elegance Walk, Al Rawdah, Jeddah',
        },
        phone: '+966126789012',
        hours: { ar: '12:00 ظ – 11:00 م', en: '12:00 PM – 11:00 PM' },
      },
    ],
  },
  {
    id: 'modern-homes',
    name: { ar: 'أكرا — أتيليه الحقائب', en: 'Akra — Bag Atelier' },
    initials: 'AK',
    category: 'bags',
    city: 'riyadh',
    location: { ar: 'حي الياسمين، ممشى التخصصي', en: 'Al Yasmeen, Takhassusi Walk' },
    description: {
      ar: 'أتيليه متخصص بتأجير حقائب دور الأزياء العالمية — حقائب مسهرة موثّقة وخدمة تأمين وتنظيف بعد كل إيجار.',
      en: 'A specialised atelier renting authenticated luxury designer handbags — each piece tagged, insured and professionally reconditioned between clients.',
    },
    rating: 4.8,
    hours: { ar: 'السبت – الخميس، 10:00 ص – 10:00 م', en: 'Sat – Thu, 10:00 AM – 10:00 PM' },
    logoTone: 'gold',
    verified: true,
    branches: [
      {
        id: 'mh-yasmin',
        name: { ar: 'الأتيليه الرئيسي', en: 'Main Atelier' },
        address: {
          ar: 'ممشى التخصصي، الياسمين، الرياض',
          en: 'Takhassusi Walk, Al Yasmeen, Riyadh',
        },
        phone: '+966114445566',
        hours: { ar: '10:00 ص – 10:00 م', en: '10:00 AM – 10:00 PM' },
      },
      {
        id: 'mh-narjis',
        name: { ar: 'صالون النرجس الخاص', en: 'Al Narjis Private Salon' },
        address: { ar: 'شارع الأمير تركي، النرجس', en: 'Prince Turki St, Al Narjis' },
        phone: '+966114445567',
        hours: { ar: 'بحجز مسبق', en: 'By appointment' },
      },
      {
        id: 'mh-sahafa',
        name: { ar: 'نقطة الاستلام — الصحافة', en: 'Al Sahafa Pickup Point' },
        address: { ar: 'طريق الأمير تركي، الصحافة', en: 'Prince Turki Rd, Al Sahafa' },
        phone: '+966114445568',
        hours: { ar: '2:00 ظ – 10:00 م', en: '2:00 PM – 10:00 PM' },
      },
    ],
  },
  {
    id: 'business-towers',
    name: { ar: 'تيمبو لتأجير الساعات', en: 'Tempo Watch Gallery' },
    initials: 'TW',
    category: 'watches',
    city: 'khobar',
    location: { ar: 'كورنيش الخبر، المعرض الخاص', en: 'Khobar Corniche, Private Gallery' },
    description: {
      ar: 'معرض خاص لتأجير ساعات سويسرية فاخرة بالأسبوع أو المناسبة — خدمة توصيل خاص وتأمين شامل على القيمة الكاملة.',
      en: 'A private Swiss-watch rental gallery by week or occasion — concierge delivery and full-value insurance included on every rental.',
    },
    rating: 4.8,
    hours: { ar: 'الأحد – الخميس، 11:00 ص – 9:00 م', en: 'Sun – Thu, 11:00 AM – 9:00 PM' },
    logoTone: 'ink',
    verified: true,
    branches: [
      {
        id: 'bt-corniche',
        name: { ar: 'المعرض الخاص — الكورنيش', en: 'Private Gallery — Corniche' },
        address: { ar: 'طريق الكورنيش، الخبر', en: 'Corniche Rd, Khobar' },
        phone: '+966138887766',
        hours: { ar: 'بحجز مسبق — 11:00 ص – 9:00 م', en: 'By appointment — 11:00 AM – 9:00 PM' },
      },
    ],
  },
  {
    id: 'saudi-gear',
    name: { ar: 'دار الأناقة للبشوت', en: 'Dar Al-Anaqa Bishts' },
    initials: 'DA',
    category: 'bishts',
    city: 'riyadh',
    location: { ar: 'حي السفارات، ممشى التراث', en: 'Diplomatic Quarter, Heritage Walk' },
    description: {
      ar: 'دار متخصصة بتأجير البشوت المطرّزة يدوياً بالزري الأصلي، لمناسبات الزواج والأعياد — خدمة مقاس ضيق وتطريز الأحرف.',
      en: 'A specialist house for hand-embroidered bishts with original zari for weddings and formal occasions — tailored fitting and monogram embroidery on request.',
    },
    rating: 4.7,
    hours: { ar: 'السبت – الخميس، 10:00 ص – 10:00 م', en: 'Sat – Thu, 10:00 AM – 10:00 PM' },
    logoTone: 'brand',
    verified: true,
    branches: [
      {
        id: 'sg-dammam',
        name: { ar: 'الدار الرئيسية', en: 'Main House' },
        address: {
          ar: 'ممشى التراث، السفارات، الرياض',
          en: 'Heritage Walk, DQ, Riyadh',
        },
        phone: '+966138201020',
        hours: { ar: '10:00 ص – 10:00 م', en: '10:00 AM – 10:00 PM' },
      },
      {
        id: 'sg-jubail',
        name: { ar: 'نقطة الاستلام — جدة', en: 'Jeddah Pickup Point' },
        address: { ar: 'ممشى التحلية، جدة', en: 'Tahlia Walk, Jeddah' },
        phone: '+966134567890',
        hours: { ar: '4:00 ظ – 10:00 م', en: '4:00 PM – 10:00 PM' },
      },
    ],
  },
  {
    id: 'rawafid-office',
    name: { ar: 'شيك هاير للحقائب', en: 'Chic Hire Atelier' },
    initials: 'CH',
    category: 'bags',
    city: 'riyadh',
    location: { ar: 'حي الصحافة، ممشى البوتيكات', en: 'Al Sahafa, Boutique Walk' },
    description: {
      ar: 'بوتيك ناشئ لتأجير الحقائب الموسمية بأسعار مدروسة — تشكيلة متجدّدة أسبوعياً وتوصيل إلى المنزل داخل الرياض.',
      en: 'An emerging boutique for seasonal handbag rentals at approachable prices — a fresh selection weekly and home delivery across Riyadh.',
    },
    rating: 4.4,
    hours: { ar: 'السبت – الخميس، 10:00 ص – 10:00 م', en: 'Sat – Thu, 10:00 AM – 10:00 PM' },
    logoTone: 'success',
    verified: false,
    branches: [
      {
        id: 'ro-sahafa',
        name: { ar: 'صالون الصحافة', en: 'Al Sahafa Salon' },
        address: { ar: 'ممشى البوتيكات، الصحافة', en: 'Boutique Walk, Al Sahafa' },
        phone: '+966115556677',
        hours: { ar: '10:00 ص – 10:00 م', en: '10:00 AM – 10:00 PM' },
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
  attributes?: ItemAttribute[];
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
        ar: 'تأجير فستان سهرة لافاندير — مقاس 40',
        en: 'Rental — Lavender evening gown, size 40',
      },
      purpose: {
        ar: 'تأجير قطعة سهرة راقية لمناسبة زفاف خاصة',
        en: 'Occasion rental of a couture evening gown for a private wedding',
      },
      pickupDate: '2026-04-22',
      returnDate: '2026-04-27',
      durationDays: 5,
      pickupLocation: {
        ar: 'فرع العليا — بوليفارد لكجري، الرياض',
        en: 'Olaya Atelier — Luxury Blvd, Riyadh',
      },
    },
    items: [
      {
        id: 'itm-1',
        name: {
          ar: 'فستان سهرة لافاندير — تطريز يدوي',
          en: 'Lavender hand-embroidered evening gown',
        },
        qty: 1,
        unitValue: 18500,
        serial: 'MS-DR-40-LAV-0231',
        attributes: [
          { label: { ar: 'المصمّم', en: 'Designer' }, value: { ar: 'لافاندير أتيليه', en: 'Lavender Atelier' } },
          { label: { ar: 'المقاس', en: 'Size' }, value: { ar: '40 أوروبي', en: 'EU 40' } },
          { label: { ar: 'اللون', en: 'Colour' }, value: { ar: 'لافاندير باستيل', en: 'Pastel lavender' } },
          { label: { ar: 'الخامة', en: 'Fabric' }, value: { ar: 'حرير طبيعي + تطريز يدوي', en: 'Silk with hand embroidery' } },
          { label: { ar: 'الحالة عند التسليم', en: 'Condition on handover' }, value: { ar: 'ممتازة — تمّ تعقيمها وتلميعها', en: 'Excellent — cleaned & reconditioned' } },
        ],
      },
      {
        id: 'itm-2',
        name: { ar: 'شال حرير مطابق', en: 'Matching silk shawl' },
        qty: 1,
        unitValue: 1200,
        attributes: [
          { label: { ar: 'اللون', en: 'Colour' }, value: { ar: 'لافاندير', en: 'Lavender' } },
          { label: { ar: 'الخامة', en: 'Fabric' }, value: { ar: 'حرير 100%', en: '100% silk' } },
        ],
      },
      {
        id: 'itm-3',
        name: { ar: 'حقيبة كلتش كريستال', en: 'Crystal clutch bag' },
        qty: 1,
        unitValue: 2800,
        attributes: [
          { label: { ar: 'العلامة', en: 'Brand' }, value: { ar: 'أكرا', en: 'Akra' } },
          { label: { ar: 'الحالة', en: 'Condition' }, value: { ar: 'ممتازة', en: 'Excellent' } },
        ],
      },
    ],
    fees: {
      rentalTotal: 1850,
      deposit: 3000,
      insurance: 180,
      vat: 305,
      grandTotal: 5335,
    },
    damages: {
      nonReturn: 22500,
      partialDamage: 3500,
      totalDamage: 18500,
      note: {
        ar: 'المبالغ أعلاه هي الحد الأقصى المغطى بالسند لأمر في حال عدم الإرجاع أو تلف القطعة.',
        en: 'The amounts above represent the maximum liabilities covered by the promissory note.',
      },
    },
    contract: {
      reference: 'CN-APX-2026-0412',
      clauses: [
        {
          id: 'c1',
          title: { ar: 'مدة الإيجار', en: 'Rental period' },
          body: {
            ar: 'تسري الاتفاقية لمدة 5 أيام تبدأ من تاريخ التسليم، ولا تُمدّد إلا بموافقة البوتيك كتابياً.',
            en: 'This agreement runs for 5 days from handover and is non-extendable except by written approval from the boutique.',
          },
        },
        {
          id: 'c2',
          title: { ar: 'العناية والاستخدام', en: 'Care & use' },
          body: {
            ar: 'استخدم القطعة استخداماً معقولاً ومحافظاً عليها. يُمنع الغسيل المنزلي أو التعديل عليها أو إعارتها لشخص آخر.',
            en: 'Use the piece reasonably and keep it in good condition. Home washing, alterations, or lending it to another person are not allowed.',
          },
        },
        {
          id: 'c3',
          title: { ar: 'التنظيف بعد الإرجاع', en: 'Cleaning on return' },
          body: {
            ar: 'تشمل الباقة تنظيفاً جافاً متخصّصاً بعد الإرجاع. الالتزامات المالية في حال التلف موضّحة بصراحة في بند تلف القطعة أدناه.',
            en: 'The package covers professional dry cleaning after return. Financial obligations on damage are spelled out separately under the damage clause below.',
          },
        },
        {
          id: 'c4',
          title: { ar: 'الإرجاع والتأخير', en: 'Return & late fees' },
          body: {
            ar: 'يجب إرجاع القطعة في موعدها، وإلا تُحتسب غرامة تأخير يومية قدرها 20% من قيمة الإيجار.',
            en: 'The piece must be returned on time. A daily late fee of 20% of the rental total applies otherwise.',
          },
        },
        {
          id: 'c5',
          title: { ar: 'تلف القطعة', en: 'Damage to the piece' },
          body: {
            ar: 'في حال تلف القطعة أو فقدها، يلتزم المستأجر بقيمتها الدفترية المبيّنة في هذا العقد، ويُحرَّر السند لأمر بالقيمة كاملةً.',
            en: 'If the piece is damaged or lost, the lessee is liable for its declared value, covered in full by the promissory note.',
          },
        },
      ],
    },
    note: {
      reference: 'PN-APX-2026-0412',
      beneficiary: { ar: 'دار ميزون دو سواريه', en: 'Maison de Soirée' },
      principal: 22500,
      dueDate: '2026-04-27',
      place: { ar: 'الرياض، المملكة العربية السعودية', en: 'Riyadh, Saudi Arabia' },
      purpose: {
        ar: 'ضمان إرجاع قطعة السهرة المؤجَّرة بحالتها الأصلية.',
        en: 'Security for returning the rented couture piece in its original condition.',
      },
    },
  },
];

export type MerchantRentalCategory = 'dress' | 'bag' | 'watch' | 'bisht';
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
    item: 'بشت الأمراء — صوف مطرّز بالزري',
    category: 'bisht',
    branchId: 'rm-olaya',
    startDate: '2026-02-15',
    endDate: '2026-02-20',
    nextDueDate: '2026-04-25',
    monthlyAmount: 1800,
    itemValue: 14500,
    liabilityTotal: 12000,
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
    item: 'فستان زفاف مونوليا — تطريز يدوي',
    category: 'dress',
    branchId: 'rm-olaya',
    startDate: '2026-01-05',
    endDate: '2026-01-10',
    nextDueDate: '2026-04-05',
    monthlyAmount: 2650,
    itemValue: 26500,
    liabilityTotal: 22000,
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
    item: 'حقيبة أكرا آيكن — جلد أسود',
    category: 'bag',
    branchId: 'rm-malqa',
    startDate: '2025-12-20',
    endDate: '2025-12-27',
    nextDueDate: '2026-05-02',
    monthlyAmount: 3900,
    itemValue: 38500,
    liabilityTotal: 32000,
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
    item: 'ساعة أوريون السويسرية — كرونوغراف',
    category: 'watch',
    branchId: 'rm-olaya',
    startDate: '2026-03-08',
    endDate: '2026-03-15',
    nextDueDate: '2026-05-08',
    monthlyAmount: 2900,
    itemValue: 95000,
    liabilityTotal: 85000,
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
    item: 'فستان سهرة مونوليا — أحمر، مقاس 38',
    category: 'dress',
    branchId: 'rm-malqa',
    startDate: '2025-10-15',
    endDate: '2025-10-20',
    nextDueDate: '2026-04-15',
    monthlyAmount: 2100,
    itemValue: 14500,
    liabilityTotal: 12500,
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
    item: 'حقيبة باريجي — جلد سافيانو',
    category: 'bag',
    branchId: 'rm-olaya',
    startDate: '2025-09-01',
    endDate: '2025-09-06',
    nextDueDate: '2026-05-01',
    monthlyAmount: 1800,
    itemValue: 24500,
    liabilityTotal: 21000,
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
    item: 'بشت ديواني — صوف إيطالي',
    category: 'bisht',
    amount: 1450,
    submittedAt: '2026-04-19',
    branchId: 'rm-olaya',
    stage: 'awaiting-nafith',
  },
  {
    id: 'MA-2026-040',
    customerName: 'دانة الحربي',
    customerInitials: 'DH',
    item: 'فستان سهرة فيوليت — مقاس 42',
    category: 'dress',
    amount: 2400,
    submittedAt: '2026-04-18',
    branchId: 'rm-malqa',
    stage: 'awaiting-customer',
  },
  {
    id: 'MA-2026-039',
    customerName: 'سلطان الغامدي',
    customerInitials: 'SG',
    item: 'ساعة فيرتيكس كلاسيك 40',
    category: 'watch',
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
    item: 'فستان زفاف مونوليا — تطريز يدوي',
    severity: 'partial',
    claimAmount: 4200,
    reportedAt: '2026-04-10',
    status: 'investigating',
    notes: 'تمزّق واضح في شريط التطريز عند الخصر وبقع طعام على الطرف السفلي.',
    contractRef: 'CN-APX-2026-0128',
    noteRef: 'PN-APX-2026-0128',
    invoiceRef: 'INV-APX-2026-0128-04',
  },
  {
    id: 'DM-2026-005',
    rentalId: 'MR-2025-112',
    customerName: 'عبدالله الشمري',
    customerInitials: 'AS',
    item: 'ساعة أوريون السويسرية — كرونوغراف',
    severity: 'non-return',
    claimAmount: 95000,
    reportedAt: '2026-03-28',
    status: 'reported',
    notes: 'المستأجر لم يُعِد القطعة بعد انتهاء مدة الإيجار وتعذّر التواصل معه.',
    contractRef: 'CN-APX-2025-1112',
    noteRef: 'PN-APX-2025-1112',
    invoiceRef: 'INV-APX-2025-1112-03',
  },
  {
    id: 'DM-2026-002',
    rentalId: 'MR-2025-088',
    customerName: 'ريم الأحمدي',
    customerInitials: 'RA',
    item: 'حقيبة باريجي — جلد سافيانو',
    severity: 'partial',
    claimAmount: 2100,
    reportedAt: '2026-02-14',
    status: 'settled',
    notes: 'خدش سطحي على الزاوية الأمامية — تمت تسويته بالتراضي عبر التأمين.',
    contractRef: 'CN-APX-2025-0988',
    noteRef: 'PN-APX-2025-0988',
    invoiceRef: 'INV-APX-2025-0988-06',
  },
];

export const SEED_MERCHANT_HISTORY: MerchantHistoryRecord[] = [
  {
    id: 'MH-2025-118',
    customerName: 'ماجد القرني',
    item: 'بشت الأمراء — زري ذهبي',
    closedAt: '2026-03-22',
    totalAmount: 2400,
    outcome: 'completed',
  },
  {
    id: 'MH-2025-102',
    customerName: 'لمى العنزي',
    item: 'فستان سهرة أوركيد — مقاس 38',
    closedAt: '2026-02-05',
    totalAmount: 3200,
    outcome: 'completed',
  },
  {
    id: 'MH-2025-091',
    customerName: 'ناصر الشمري',
    item: 'ساعة فيرتيكس أوتوماتيك',
    closedAt: '2025-12-18',
    totalAmount: 2800,
    outcome: 'defaulted',
  },
  {
    id: 'MH-2025-077',
    customerName: 'جواهر العمري',
    item: 'حقيبة أكرا ميني',
    closedAt: '2025-11-02',
    totalAmount: 1400,
    outcome: 'cancelled',
  },
];

export const SEED_HISTORY: HistoryItem[] = [
  {
    id: 'HS-2025-011',
    title: 'حقيبة أكرا آيكن — حناء',
    counterparty: 'أكرا — أتيليه الحقائب',
    closedAt: '2025-12-30',
    amount: 2400,
    status: 'completed',
  },
  {
    id: 'HS-2025-007',
    title: 'فستان سهرة لافاندير — خطوبة',
    counterparty: 'ميزون دو سواريه',
    closedAt: '2025-09-10',
    amount: 1800,
    status: 'completed',
  },
  {
    id: 'HS-2024-003',
    title: 'بشت مطرّز — عيد الفطر',
    counterparty: 'دار الأناقة للبشوت',
    closedAt: '2024-11-02',
    amount: 1200,
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
  category: StoreCategory;
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
    companyName: 'بوتيك رُؤى للفساتين الراقية',
    authorizedName: 'فيصل العتيبي',
    authorizedId: '1099887766',
    commercialReg: '1010412388',
    vatNumber: '300123456700003',
    iban: 'SA03 8000 0000 6080 1016 7519',
    contactEmail: 'finance@ruaboutique.sa',
    contactPhone: '0551234567',
    city: 'الرياض',
    address: 'حي الملقا — ممشى البوتيكات',
    category: 'dresses',
    expectedVolume: 85000,
    submittedAt: '2026-04-19T09:12:00+03:00',
    initials: 'ب ر',
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
    companyName: 'بوتيك نور الأناقة للبشوت',
    authorizedName: 'نوف الحربي',
    authorizedId: '1077665544',
    commercialReg: '4030288120',
    vatNumber: '300987654300003',
    iban: 'SA44 4000 0000 1234 5678 9012',
    contactEmail: 'admin@noor-anaqa.com',
    contactPhone: '0556677889',
    city: 'جدة',
    address: 'حي الزهراء — ممشى التحلية',
    category: 'bishts',
    expectedVolume: 48000,
    submittedAt: '2026-04-18T14:43:00+03:00',
    initials: 'ب ن',
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
    companyName: 'صالون تايم بيسز لتأجير الساعات',
    authorizedName: 'سلطان القحطاني',
    authorizedId: '1066554433',
    commercialReg: '2055011733',
    vatNumber: '300555444300003',
    iban: 'SA12 1000 0000 9988 7766 5544',
    contactEmail: 'ops@timepieces.sa',
    contactPhone: '0509988776',
    city: 'الدمام',
    address: 'حي الشاطئ الغربي — المعرض الخاص',
    category: 'watches',
    expectedVolume: 62000,
    submittedAt: '2026-04-17T11:02:00+03:00',
    initials: 'ت ب',
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
    companyName: 'مجموعة صُهبة للحقائب الفاخرة',
    authorizedName: 'منيرة الزهراني',
    authorizedId: '1055443322',
    commercialReg: '1010509274',
    vatNumber: '300333222100003',
    iban: 'SA77 2000 0000 3344 5566 7788',
    contactEmail: 'leasing@suhba-bags.com',
    contactPhone: '0533322211',
    city: 'الرياض',
    address: 'حي الياسمين — ممشى التخصصي',
    category: 'bags',
    expectedVolume: 120000,
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
    merchantName: 'تيمبو لتأجير الساعات',
    customerName: 'عبدالله الشمري',
    customerInitials: 'ع ش',
    item: 'ساعة أوريون السويسرية — كرونوغراف',
    severity: 'non-return',
    stage: 'nafith',
    claimAmount: 95000,
    reportedAt: '2026-04-11T10:15:00+03:00',
  },
  {
    id: 'DM-2026-117',
    merchantName: 'ميزون دو سواريه',
    customerName: 'هناء الدوسري',
    customerInitials: 'ه د',
    item: 'فستان زفاف مونوليا — تطريز يدوي',
    severity: 'partial',
    stage: 'settlement',
    claimAmount: 4200,
    reportedAt: '2026-04-14T13:40:00+03:00',
  },
  {
    id: 'DM-2026-116',
    merchantName: 'أكرا — أتيليه الحقائب',
    customerName: 'بدر العنزي',
    customerInitials: 'ب ع',
    item: 'حقيبة أكرا آيكن — إديشن محدود',
    severity: 'total',
    stage: 'execution',
    claimAmount: 48500,
    reportedAt: '2026-04-02T08:30:00+03:00',
  },
  {
    id: 'DM-2026-115',
    merchantName: 'دار الأناقة للبشوت',
    customerName: 'ريم القحطاني',
    customerInitials: 'ر ق',
    item: 'بشت ديواني — زري ذهبي',
    severity: 'partial',
    stage: 'review',
    claimAmount: 2400,
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
    merchantName: 'تيمبو لتأجير الساعات',
    customerName: 'ماجد الحربي',
    customerInitials: 'م ح',
    item: 'ساعة فيرتيكس أوتوماتيك',
    daysOverdue: 4,
    amount: 2100,
    bucket: '1-7',
  },
  {
    id: 'CN-APX-9733',
    merchantName: 'ميزون دو سواريه',
    customerName: 'أمل السبيعي',
    customerInitials: 'أ س',
    item: 'فستان سهرة فيوليت — مقاس 40',
    daysOverdue: 12,
    amount: 1850,
    bucket: '8-30',
  },
  {
    id: 'CN-APX-9688',
    merchantName: 'أكرا — أتيليه الحقائب',
    customerName: 'خالد المطيري',
    customerInitials: 'خ م',
    item: 'حقيبة أكرا ميني — جلد أحمر',
    daysOverdue: 38,
    amount: 1800,
    bucket: '31-60',
  },
  {
    id: 'CN-APX-9571',
    merchantName: 'دار الأناقة للبشوت',
    customerName: 'وضحى الرشيدي',
    customerInitials: 'و ر',
    item: 'بشت مطرّز — عيد',
    daysOverdue: 74,
    amount: 1450,
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
        title: 'فستان سهرة لافاندير — خطوبة',
        merchantName: 'ميزون دو سواريه',
        amount: 1850,
        at: '2026-04-14T10:12:00+03:00',
      },
      {
        id: 'ACT-S-02',
        type: 'payment',
        title: 'سداد رسم تأجير',
        amount: 2100,
        at: '2026-04-10T12:00:00+03:00',
      },
      {
        id: 'ACT-S-03',
        type: 'contract',
        title: 'توقيع عقد CN-APX-9912',
        merchantName: 'ميزون دو سواريه',
        at: '2026-04-14T10:15:00+03:00',
      },
      {
        id: 'ACT-S-04',
        type: 'return',
        title: 'إرجاع حقيبة أكرا آيكن',
        merchantName: 'أكرا — أتيليه الحقائب',
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
        title: 'بشت ديواني — صوف إيطالي',
        merchantName: 'دار الأناقة للبشوت',
        amount: 1450,
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
        title: 'ساعة أوريون السويسرية',
        merchantName: 'تيمبو لتأجير الساعات',
        amount: 2900,
        at: '2026-04-09T17:22:00+03:00',
      },
      {
        id: 'ACT-N-02',
        type: 'rental',
        title: 'حقيبة أكرا ميني — عيد',
        merchantName: 'أكرا — أتيليه الحقائب',
        amount: 1800,
        at: '2026-03-21T12:00:00+03:00',
      },
      {
        id: 'ACT-N-03',
        type: 'payment',
        title: 'سداد رسم تأجير',
        amount: 3800,
        at: '2026-04-12T18:10:00+03:00',
      },
      {
        id: 'ACT-N-04',
        type: 'contract',
        title: 'توقيع عقد CN-APX-9834',
        merchantName: 'تيمبو لتأجير الساعات',
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
        title: 'فستان سهرة فيوليت — مقاس 42',
        merchantName: 'فيلا كوتور للمناسبات',
        amount: 2400,
        at: '2026-02-05T11:05:00+03:00',
      },
      {
        id: 'ACT-F-03',
        type: 'payment',
        title: 'سداد رسم تأجير',
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
        title: 'إرجاع حقيبة باريجي — جلد سافيانو',
        merchantName: 'شيك هاير للحقائب',
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
        title: 'فستان سهرة أوركيد — حفل',
        merchantName: 'ميزون دو سواريه',
        amount: 2200,
        at: '2026-04-01T10:30:00+03:00',
      },
      {
        id: 'ACT-H-02',
        type: 'payment',
        title: 'سداد رسم تأجير',
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
        title: 'بشت زفاف — زري ذهبي',
        merchantName: 'دار الأناقة للبشوت',
        amount: 1800,
        at: '2025-11-02T11:00:00+03:00',
      },
    ],
  },
];

/* ================ Admin case review ================ */

export type AdminCaseKind = 'damage' | 'overdue';

export type AdminCaseEvidenceKind =
  | 'damage-exterior'
  | 'damage-interior'
  | 'dashboard'
  | 'odometer'
  | 'signature'
  | 'receipt'
  | 'missing'
  | 'location';

export type AdminCaseEvidenceSource = 'merchant' | 'customer' | 'operator';

export type AdminCaseEvidence = {
  id: string;
  kind: AdminCaseEvidenceKind;
  caption: string;
  uploadedAt: string;
  source: AdminCaseEvidenceSource;
};

export type AdminCaseNoteRole = 'merchant' | 'operator' | 'system';
export type AdminCaseNote = {
  id: string;
  author: string;
  role: AdminCaseNoteRole;
  text: string;
  at: string;
};

export type AdminCaseAuditAction =
  | 'reported'
  | 'evidence-added'
  | 'reviewed'
  | 'note-added'
  | 'escalated-settlement'
  | 'escalated-nafith'
  | 'escalated-execution'
  | 'settled';

export type AdminCaseAuditEntry = {
  id: string;
  action: AdminCaseAuditAction;
  actor: string;
  at: string;
  detail?: string;
};

export type AdminCaseInvoiceStatus = 'paid' | 'pending' | 'overdue';
export type AdminCaseContractStatus = 'active' | 'signed' | 'closed' | 'breached';
export type AdminCaseNoteDocStatus = 'issued' | 'collected' | 'pending' | 'forwarded-nafith';

export type AdminCaseLinked = {
  invoiceRef: string;
  invoiceAmount: number;
  invoiceStatus: AdminCaseInvoiceStatus;
  invoiceDueAt: string;
  contractRef: string;
  contractStatus: AdminCaseContractStatus;
  contractStartedAt: string;
  noteRef: string;
  noteAmount: number;
  noteStatus: AdminCaseNoteDocStatus;
};

export type AdminCaseDetail = {
  id: string;
  kind: AdminCaseKind;
  summary: string;
  evidence: AdminCaseEvidence[];
  notes: AdminCaseNote[];
  audit: AdminCaseAuditEntry[];
  linked: AdminCaseLinked;
  escalation: {
    currentStage: AdminCaseStage;
    nextStage: AdminCaseStage | null;
    nextActionKey: string;
  };
};

export const SEED_ADMIN_CASE_DETAILS: Record<string, AdminCaseDetail> = {
  'DM-2026-118': {
    id: 'DM-2026-118',
    kind: 'damage',
    summary: 'ساعة سويسرية فاخرة لم تُعَد بعد انتهاء فترة السماح — تم فتح إجراء نافذ.',
    evidence: [
      {
        id: 'EV-118-01',
        kind: 'location',
        caption: 'آخر مكان تسليم معروف — المعرض الخاص بالخبر',
        uploadedAt: '2026-04-11T10:20:00+03:00',
        source: 'operator',
      },
      {
        id: 'EV-118-02',
        kind: 'missing',
        caption: 'صورة الساعة مع الرقم التسلسلي عند التسليم',
        uploadedAt: '2026-04-11T10:12:00+03:00',
        source: 'merchant',
      },
      {
        id: 'EV-118-03',
        kind: 'signature',
        caption: 'توقيع العقد الأصلي',
        uploadedAt: '2026-03-01T09:00:00+03:00',
        source: 'merchant',
      },
    ],
    notes: [
      {
        id: 'NT-118-01',
        author: 'تيمبو لتأجير الساعات',
        role: 'merchant',
        text: 'تواصلنا مع العميل ثلاث مرات دون ردّ. نطلب التصعيد فوراً.',
        at: '2026-04-11T10:14:00+03:00',
      },
      {
        id: 'NT-118-02',
        author: 'فريق العمليات',
        role: 'operator',
        text: 'تمّت مراجعة الأدلة — العقد مرتبط بسند لأمر صالح للتحويل لنافذ.',
        at: '2026-04-12T09:30:00+03:00',
      },
    ],
    audit: [
      {
        id: 'AD-118-01',
        action: 'reported',
        actor: 'تيمبو لتأجير الساعات',
        at: '2026-04-11T10:15:00+03:00',
      },
      {
        id: 'AD-118-02',
        action: 'evidence-added',
        actor: 'فريق العمليات',
        at: '2026-04-11T10:45:00+03:00',
        detail: '3 ملفات',
      },
      {
        id: 'AD-118-03',
        action: 'reviewed',
        actor: 'فريق العمليات',
        at: '2026-04-12T09:30:00+03:00',
      },
      {
        id: 'AD-118-04',
        action: 'escalated-nafith',
        actor: 'فريق العمليات',
        at: '2026-04-12T10:05:00+03:00',
        detail: 'تحويل السند للتنفيذ عبر نافذ',
      },
    ],
    linked: {
      invoiceRef: 'INV-APX-11802',
      invoiceAmount: 95000,
      invoiceStatus: 'overdue',
      invoiceDueAt: '2026-04-05T00:00:00+03:00',
      contractRef: 'CN-APX-9821',
      contractStatus: 'breached',
      contractStartedAt: '2026-03-01T09:00:00+03:00',
      noteRef: 'PN-APX-9821',
      noteAmount: 95000,
      noteStatus: 'forwarded-nafith',
    },
    escalation: {
      currentStage: 'nafith',
      nextStage: 'execution',
      nextActionKey: 'escalateExecution',
    },
  },
  'DM-2026-117': {
    id: 'DM-2026-117',
    kind: 'damage',
    summary: 'ضرر جزئي في فستان زفاف — تسوية قيد التفاوض مع العميلة.',
    evidence: [
      {
        id: 'EV-117-01',
        kind: 'damage-interior',
        caption: 'تمزّق في شريط التطريز عند الخصر',
        uploadedAt: '2026-04-14T13:30:00+03:00',
        source: 'merchant',
      },
      {
        id: 'EV-117-02',
        kind: 'damage-interior',
        caption: 'بقع واضحة على الذيل من الأمام',
        uploadedAt: '2026-04-14T13:32:00+03:00',
        source: 'merchant',
      },
      {
        id: 'EV-117-03',
        kind: 'receipt',
        caption: 'عرض سعر الترميم من الأتيليه المعتمد',
        uploadedAt: '2026-04-15T10:00:00+03:00',
        source: 'merchant',
      },
    ],
    notes: [
      {
        id: 'NT-117-01',
        author: 'ميزون دو سواريه',
        role: 'merchant',
        text: 'قيمة الترميم التقديرية 4,200 ر.س حسب الأتيليه.',
        at: '2026-04-14T13:45:00+03:00',
      },
      {
        id: 'NT-117-02',
        author: 'فريق العمليات',
        role: 'operator',
        text: 'تم التواصل مع العميلة — تقترح دفع 3,200 ر.س.',
        at: '2026-04-16T12:00:00+03:00',
      },
    ],
    audit: [
      {
        id: 'AD-117-01',
        action: 'reported',
        actor: 'ميزون دو سواريه',
        at: '2026-04-14T13:40:00+03:00',
      },
      {
        id: 'AD-117-02',
        action: 'evidence-added',
        actor: 'ميزون دو سواريه',
        at: '2026-04-14T13:50:00+03:00',
        detail: '3 ملفات',
      },
      {
        id: 'AD-117-03',
        action: 'escalated-settlement',
        actor: 'فريق العمليات',
        at: '2026-04-16T12:05:00+03:00',
      },
    ],
    linked: {
      invoiceRef: 'INV-APX-11740',
      invoiceAmount: 4200,
      invoiceStatus: 'pending',
      invoiceDueAt: '2026-04-28T00:00:00+03:00',
      contractRef: 'CN-APX-9733',
      contractStatus: 'closed',
      contractStartedAt: '2026-02-10T10:00:00+03:00',
      noteRef: 'PN-APX-9733',
      noteAmount: 4200,
      noteStatus: 'pending',
    },
    escalation: {
      currentStage: 'settlement',
      nextStage: 'nafith',
      nextActionKey: 'escalateNafith',
    },
  },
  'DM-2026-116': {
    id: 'DM-2026-116',
    kind: 'damage',
    summary: 'تلف كلّي في حقيبة إديشن محدود — تنفيذ عبر نافذ.',
    evidence: [
      {
        id: 'EV-116-01',
        kind: 'damage-exterior',
        caption: 'تلف كامل في الواجهة الأمامية للحقيبة',
        uploadedAt: '2026-04-02T08:45:00+03:00',
        source: 'merchant',
      },
      {
        id: 'EV-116-02',
        kind: 'damage-exterior',
        caption: 'كسر في قفل الحقيبة الأصلي',
        uploadedAt: '2026-04-02T08:46:00+03:00',
        source: 'merchant',
      },
      {
        id: 'EV-116-03',
        kind: 'odometer',
        caption: 'صورة الحقيبة عند التسليم الأصلي',
        uploadedAt: '2026-03-20T09:00:00+03:00',
        source: 'merchant',
      },
      {
        id: 'EV-116-04',
        kind: 'receipt',
        caption: 'تقرير خبير الحقائب المعتمد',
        uploadedAt: '2026-04-02T15:00:00+03:00',
        source: 'operator',
      },
    ],
    notes: [
      {
        id: 'NT-116-01',
        author: 'أكرا — أتيليه الحقائب',
        role: 'merchant',
        text: 'الحقيبة تالفة كلياً — مطالبة بالقيمة الدفترية 48,500 ر.س.',
        at: '2026-04-02T08:50:00+03:00',
      },
      {
        id: 'NT-116-02',
        author: 'النظام',
        role: 'system',
        text: 'تم تمرير السند تلقائياً لنافذ للتنفيذ.',
        at: '2026-04-10T08:00:00+03:00',
      },
    ],
    audit: [
      {
        id: 'AD-116-01',
        action: 'reported',
        actor: 'أكرا — أتيليه الحقائب',
        at: '2026-04-02T08:30:00+03:00',
      },
      {
        id: 'AD-116-02',
        action: 'evidence-added',
        actor: 'أكرا — أتيليه الحقائب',
        at: '2026-04-02T09:00:00+03:00',
        detail: '4 ملفات',
      },
      {
        id: 'AD-116-03',
        action: 'escalated-nafith',
        actor: 'فريق العمليات',
        at: '2026-04-05T10:00:00+03:00',
      },
      {
        id: 'AD-116-04',
        action: 'escalated-execution',
        actor: 'نافذ',
        at: '2026-04-10T08:00:00+03:00',
        detail: 'بدأت إجراءات التنفيذ',
      },
    ],
    linked: {
      invoiceRef: 'INV-APX-11655',
      invoiceAmount: 48500,
      invoiceStatus: 'overdue',
      invoiceDueAt: '2026-04-12T00:00:00+03:00',
      contractRef: 'CN-APX-9688',
      contractStatus: 'breached',
      contractStartedAt: '2026-03-20T09:00:00+03:00',
      noteRef: 'PN-APX-9688',
      noteAmount: 48500,
      noteStatus: 'forwarded-nafith',
    },
    escalation: {
      currentStage: 'execution',
      nextStage: null,
      nextActionKey: 'awaitOutcome',
    },
  },
  'DM-2026-115': {
    id: 'DM-2026-115',
    kind: 'damage',
    summary: 'بشت مطرّز مع علامات ضرر — قيد مراجعة الأدلة من العمليات.',
    evidence: [
      {
        id: 'EV-115-01',
        kind: 'damage-exterior',
        caption: 'تمزّق واضح على حافة الجانب الأيمن',
        uploadedAt: '2026-04-18T08:45:00+03:00',
        source: 'merchant',
      },
      {
        id: 'EV-115-02',
        kind: 'damage-interior',
        caption: 'بقع عطرية على البطانة الداخلية',
        uploadedAt: '2026-04-18T08:47:00+03:00',
        source: 'merchant',
      },
    ],
    notes: [
      {
        id: 'NT-115-01',
        author: 'دار الأناقة للبشوت',
        role: 'merchant',
        text: 'العميل يُنكر مسؤوليته — نطلب مراجعة عاجلة.',
        at: '2026-04-18T09:05:00+03:00',
      },
    ],
    audit: [
      {
        id: 'AD-115-01',
        action: 'reported',
        actor: 'دار الأناقة للبشوت',
        at: '2026-04-18T09:00:00+03:00',
      },
      {
        id: 'AD-115-02',
        action: 'evidence-added',
        actor: 'دار الأناقة للبشوت',
        at: '2026-04-18T09:02:00+03:00',
        detail: '2 ملفات',
      },
    ],
    linked: {
      invoiceRef: 'INV-APX-11812',
      invoiceAmount: 2400,
      invoiceStatus: 'pending',
      invoiceDueAt: '2026-05-02T00:00:00+03:00',
      contractRef: 'CN-APX-9812',
      contractStatus: 'active',
      contractStartedAt: '2026-04-01T14:00:00+03:00',
      noteRef: 'PN-APX-9812',
      noteAmount: 2400,
      noteStatus: 'issued',
    },
    escalation: {
      currentStage: 'review',
      nextStage: 'settlement',
      nextActionKey: 'escalateSettlement',
    },
  },
  'CN-APX-9821-OD': {
    id: 'CN-APX-9821-OD',
    kind: 'overdue',
    summary: 'قسط متأخّر 4 أيام على ساعة سويسرية — العميل لم يستجب لإشعارَين.',
    evidence: [
      {
        id: 'EV-OD-9821-01',
        kind: 'receipt',
        caption: 'آخر محاولة سداد — فشلت بسبب الرصيد',
        uploadedAt: '2026-04-15T14:00:00+03:00',
        source: 'operator',
      },
    ],
    notes: [
      {
        id: 'NT-OD-9821-01',
        author: 'النظام',
        role: 'system',
        text: 'تم إرسال إشعارين — لم يتم استلام ردّ.',
        at: '2026-04-17T09:00:00+03:00',
      },
    ],
    audit: [
      {
        id: 'AD-OD-9821-01',
        action: 'reported',
        actor: 'النظام',
        at: '2026-04-15T00:10:00+03:00',
      },
      {
        id: 'AD-OD-9821-02',
        action: 'reviewed',
        actor: 'فريق التحصيل',
        at: '2026-04-17T09:00:00+03:00',
      },
    ],
    linked: {
      invoiceRef: 'INV-APX-98210',
      invoiceAmount: 2100,
      invoiceStatus: 'overdue',
      invoiceDueAt: '2026-04-15T00:00:00+03:00',
      contractRef: 'CN-APX-9821',
      contractStatus: 'active',
      contractStartedAt: '2026-01-15T10:00:00+03:00',
      noteRef: 'PN-APX-9821',
      noteAmount: 12600,
      noteStatus: 'issued',
    },
    escalation: {
      currentStage: 'review',
      nextStage: 'settlement',
      nextActionKey: 'escalateSettlement',
    },
  },
  'CN-APX-9733-OD': {
    id: 'CN-APX-9733-OD',
    kind: 'overdue',
    summary: 'متأخّر ١٢ يوماً على فستان سهرة — العميلة تعد بالسداد هذا الأسبوع.',
    evidence: [],
    notes: [
      {
        id: 'NT-OD-9733-01',
        author: 'ميزون دو سواريه',
        role: 'merchant',
        text: 'تواصلنا مع العميلة — وعدت بالسداد خلال يومين.',
        at: '2026-04-18T11:00:00+03:00',
      },
    ],
    audit: [
      {
        id: 'AD-OD-9733-01',
        action: 'reported',
        actor: 'النظام',
        at: '2026-04-09T00:10:00+03:00',
      },
      {
        id: 'AD-OD-9733-02',
        action: 'note-added',
        actor: 'ميزون دو سواريه',
        at: '2026-04-18T11:00:00+03:00',
      },
    ],
    linked: {
      invoiceRef: 'INV-APX-97330',
      invoiceAmount: 1850,
      invoiceStatus: 'overdue',
      invoiceDueAt: '2026-04-09T00:00:00+03:00',
      contractRef: 'CN-APX-9733',
      contractStatus: 'active',
      contractStartedAt: '2025-12-01T11:00:00+03:00',
      noteRef: 'PN-APX-9733',
      noteAmount: 14800,
      noteStatus: 'issued',
    },
    escalation: {
      currentStage: 'review',
      nextStage: 'settlement',
      nextActionKey: 'escalateSettlement',
    },
  },
  'CN-APX-9688-OD': {
    id: 'CN-APX-9688-OD',
    kind: 'overdue',
    summary: 'متأخّر ٣٨ يوماً على حقيبة إديشن محدود — تم بدء محادثة تسوية.',
    evidence: [
      {
        id: 'EV-OD-9688-01',
        kind: 'receipt',
        caption: 'كشف سجل المحاولات',
        uploadedAt: '2026-04-10T10:00:00+03:00',
        source: 'operator',
      },
    ],
    notes: [
      {
        id: 'NT-OD-9688-01',
        author: 'أكرا — أتيليه الحقائب',
        role: 'merchant',
        text: 'العميل عرض جدولة السداد على 3 دفعات.',
        at: '2026-04-12T16:30:00+03:00',
      },
      {
        id: 'NT-OD-9688-02',
        author: 'فريق التحصيل',
        role: 'operator',
        text: 'تمت الموافقة على جدولة الدفعات — نتابع الأسبوع المقبل.',
        at: '2026-04-14T09:45:00+03:00',
      },
    ],
    audit: [
      {
        id: 'AD-OD-9688-01',
        action: 'reported',
        actor: 'النظام',
        at: '2026-03-14T00:10:00+03:00',
      },
      {
        id: 'AD-OD-9688-02',
        action: 'escalated-settlement',
        actor: 'فريق التحصيل',
        at: '2026-04-10T10:00:00+03:00',
      },
    ],
    linked: {
      invoiceRef: 'INV-APX-96880',
      invoiceAmount: 1800,
      invoiceStatus: 'overdue',
      invoiceDueAt: '2026-03-14T00:00:00+03:00',
      contractRef: 'CN-APX-9688',
      contractStatus: 'active',
      contractStartedAt: '2025-09-20T10:00:00+03:00',
      noteRef: 'PN-APX-9688',
      noteAmount: 18500,
      noteStatus: 'pending',
    },
    escalation: {
      currentStage: 'settlement',
      nextStage: 'nafith',
      nextActionKey: 'escalateNafith',
    },
  },
  'CN-APX-9571-OD': {
    id: 'CN-APX-9571-OD',
    kind: 'overdue',
    summary: 'متأخّر ٧٤ يوماً على بشت مطرّز — تم تحويل السند لنافذ لبدء الإجراءات.',
    evidence: [
      {
        id: 'EV-OD-9571-01',
        kind: 'signature',
        caption: 'سند لأمر موقّع',
        uploadedAt: '2025-08-12T10:00:00+03:00',
        source: 'merchant',
      },
    ],
    notes: [
      {
        id: 'NT-OD-9571-01',
        author: 'النظام',
        role: 'system',
        text: 'تم تحويل السند تلقائياً لنافذ — بانتظار النتيجة.',
        at: '2026-03-20T00:10:00+03:00',
      },
    ],
    audit: [
      {
        id: 'AD-OD-9571-01',
        action: 'reported',
        actor: 'النظام',
        at: '2026-02-06T00:10:00+03:00',
      },
      {
        id: 'AD-OD-9571-02',
        action: 'escalated-settlement',
        actor: 'فريق التحصيل',
        at: '2026-03-01T12:00:00+03:00',
      },
      {
        id: 'AD-OD-9571-03',
        action: 'escalated-nafith',
        actor: 'فريق العمليات',
        at: '2026-03-20T09:00:00+03:00',
      },
    ],
    linked: {
      invoiceRef: 'INV-APX-95710',
      invoiceAmount: 1450,
      invoiceStatus: 'overdue',
      invoiceDueAt: '2026-02-06T00:00:00+03:00',
      contractRef: 'CN-APX-9571',
      contractStatus: 'breached',
      contractStartedAt: '2025-08-12T10:00:00+03:00',
      noteRef: 'PN-APX-9571',
      noteAmount: 14500,
      noteStatus: 'forwarded-nafith',
    },
    escalation: {
      currentStage: 'nafith',
      nextStage: 'execution',
      nextActionKey: 'escalateExecution',
    },
  },
};
