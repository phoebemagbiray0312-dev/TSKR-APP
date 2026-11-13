// Values copied from the design mockup (Signup.dc.html) and Developer Guide §1
export const colors = {
  teal: '#044D5E',
  tealHover: '#06647A',
  green: '#6EDA60',
  bg: '#F4F7F6',
  tint: '#E6F1F3',
  white: '#FFFFFF',
  text: '#044D5E',
  muted: '#5B6472',
  body: '#344054',
  heroSub: '#CFE3E7',
  border: '#D0D5DD',
  borderSoft: '#E4E7EC',
  divider: '#EEF0F3',
  error: '#B42318',
  warnBg: '#FFF4E5',
  warnText: '#6B3A16',
  disabledBg: '#E4E7EC',
  disabledText: '#98A2B3',
  overlay: 'rgba(4,30,38,0.55)',
};

export const font = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
  extrabold: 'Poppins_800ExtraBold',
};

// TSKR's "speech bubble" corner: three round corners, bottom-left tight
export const bubble = (r: number, tight: number) => ({
  borderTopLeftRadius: r,
  borderTopRightRadius: r,
  borderBottomRightRadius: r,
  borderBottomLeftRadius: tight,
});
