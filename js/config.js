// =============================================================
// config.js – default settings and subject definitions.
// Everything here is editable later from the Settings page and is
// persisted in the browser; these are only the factory defaults.
// =============================================================

export const APP_VERSION = '1.0.0';
export const SCHEMA_VERSION = 1;

export const SUBJECT_TYPES = ['تخصصية', 'مساعدة', 'عامة'];
export const GENDERS = ['ذكر', 'انثى'];
export const EDUCATIONS = ['الفرع العلمي', 'اعدادية تمريض', 'اعدادية قبالة'];
export const SUMMER_OPTIONS = ['مستوفي', 'غير مستوفي'];

/** Result vocabulary (must match the Excel formulas exactly). */
export const R = {
  PASS: 'ناجح',
  FAIL: 'راسب',
  SUPP_AVG: 'مكمل بالمعدل',
  SUPP_1: 'مكمل بمادة',
  SUPP_1_AVG: 'مكمل بمادة+المعدل',
  SUPP_2: 'مكمل بمادتين',
  INCOMPLETE: 'غير مكتمل',
  MET: 'مستوفي',
  NOT_MET: 'غير مستوفي',
};

// s: subject factory. cardRow/cardPos place the subject on the printed result card.
const s = (id, ar, en, type, units, cardName, cardRow, cardPos, extra = {}) => ({
  id, ar, en, type, units, passMark: 50, counted: true, cardName, cardRow, cardPos, ...extra,
});

export const DEFAULT_SUBJECTS = {
  s1: [
    s('s1_fund', 'اساسيات التمريض و الطوارئ', 'Fundamentals of Nursing', 'تخصصية', 12, 'اساسيات تمريض و الطوارئ', 1, 1),
    s('s1_msn', 'تمريض باطني جراحي', 'Medical Surgical Nursing', 'تخصصية', 12, 'تمريض باطني جراحي', 1, 2,
      { hint: 'رأس العمود في ملف Excel يذكر 8 وحدات لكن المعادلة تستخدم 12 — القيمة الافتراضية هنا 12 ويمكن تعديلها.' }),
    s('s1_anat', 'تشريح وفسلجة', 'Anatomy & Physiology', 'مساعدة', 8, 'تشريح وفسلجة', 1, 3),
    s('s1_fa', 'العناية ما قبل المستشفى', 'Fundamental first aid', 'مساعدة', 12, 'العناية ما قبل المستشفى', 1, 4),
    s('s1_micro', 'احياء مجهرية', 'Microbiology', 'مساعدة', 4, 'احياء مجهرية', 2, 1),
    s('s1_chem', 'كيمياء سريرية', 'Clinical Chemistry', 'مساعدة', 4, 'كيمياء سريرية', 2, 2),
    s('s1_arabic', 'اللغة العربية', 'Arabic', 'مساعدة', 2, 'اللغة العربية', 2, 3),
    s('s1_comp', 'تطبيقات الحاسوب', 'Computer Applications', 'مساعدة', 2, 'الحاسوب', 2, 4),
    s('s1_hr', 'حقوق انسان وديمقراطية', 'Human Rights & Democracy', 'عامة', 2, 'حقوق انسان وديمقراطية', 2, 5),
    s('s1_eng', 'اللغة الانكليزية', 'English Language', 'عامة', 2, 'انكليزي', 1, 5),
    s('s1_ethics', 'اخلاقيات المهنة', 'Professional Ethics', 'عامة', 2, 'اخلاقيات المهنة', 2, 6,
      { counted: false, optional: true, hint: 'مادة اختيارية — غير محتسبة افتراضياً (لا تدخل في المعدل ولا في عدد الرسوب).' }),
  ],
  s2: [
    s('s2_emerg', 'تمريض الطوارئ', 'Nursing Emergency', 'تخصصية', 20, 'تمريض طوارئ', 1, 1),
    s('s2_crit', 'تمريض الحالات الحرجة', 'Critical Nursing', 'تخصصية', 20, 'تمريض الحالات الحرجة', 1, 2),
    s('s2_phc', 'رعاية صحية اولية', 'Primary Health Care', 'تخصصية', 12, 'رعاية صحية اولية', 1, 3),
    s('s2_nutr', 'تغذية ومعالجة غذائية', 'Nutrition Diet Therapy', 'مساعدة', 2, 'تغذية ومعالجة غذائية', 1, 4),
    s('s2_pharm', 'الدوائيات', 'Pharmacology', 'مساعدة', 8, 'الدوائيات', 1, 5),
    s('s2_comp', 'تطبيقات حاسوب', 'Computer Applications', 'مساعدة', 6, 'تطبيقات الحاسوب', 2, 2),
    s('s2_research', 'مشروع بحث التخرج', 'Graduation Research Project', 'تخصصية', 4, 'مشروع بحث التخرج', 2, 1),
    s('s2_eng', 'اللغة الانكليزية', 'English Language', 'مساعدة', 2, 'انكليزي', 2, 3),
    s('s2_hdev', 'التنمية البشرية', 'Human Development', 'مساعدة', 2, 'تنمية بشرية', 2, 4),
  ],
};

export const DEFAULT_SETTINGS = {
  ministry: 'وزارة الصحة',
  directorate: 'دائرة صحة واسط',
  institute: 'معهد الصحة العالي',
  department: 'قسم الطوارئ',
  year: '2026/2025',
  stage1Name: 'المرحلة الاولى',
  stage2Name: 'المرحلة الثانية',
  finalName: 'النتيجة النهائية',
  round: 1, // 1 = الدور الاول, 2 = الدور الثاني
  note: 'ملاحظة : هذه النتيجة لاتمثل وثيقة رسمية',
  chairTitle: 'رئيس اللجنة الامتحانية',
  chairName: 'احمد ثاني سعدون',
  deanTitle: 'عميد المعهد',
  deanName: 'مصطفى محمد علي',
  logo: '', // data URL; empty = bundled default logo
  avgPassMark: 60, // stage average threshold used by the stage-result rule
  w1: 0.4, // final average weights
  w2: 0.6,
  showNumericOnCard: false,
  cardsPerPage: 4,
  decimals: 2,
};

export const ROUND_LABEL = (r) => (Number(r) === 2 ? 'الدور الثاني' : 'الدور الاول');
export const ROUND_RESULTS_LABEL = (r) => (Number(r) === 2 ? 'نتائج الدور الثاني' : 'نتائج الدور الاول');

export function defaultState() {
  return {
    schema: SCHEMA_VERSION,
    settings: structuredClone(DEFAULT_SETTINGS),
    subjects: structuredClone(DEFAULT_SUBJECTS),
    students: [],
    nextId: 1,
    updatedAt: null,
  };
}
