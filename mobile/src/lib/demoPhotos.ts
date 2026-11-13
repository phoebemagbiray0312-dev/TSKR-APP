// Photos of the demo taskers from the prototype (design/client/assets).
// Real taskers will use Supabase Storage paths instead. Demo taskers have photo_path 'demo/t1' etc.
import { ImageSourcePropType } from 'react-native';

const COVER: Record<string, ImageSourcePropType> = {
  t1: require('../../assets/demo/cover-t1.jpg'), t2: require('../../assets/demo/cover-t2.jpg'),
  t3: require('../../assets/demo/cover-t3.jpg'), t4: require('../../assets/demo/cover-t4.jpg'),
  t5: require('../../assets/demo/cover-t5.jpg'), t6: require('../../assets/demo/cover-t6.jpg'),
  t7: require('../../assets/demo/cover-t7.jpg'), t8: require('../../assets/demo/cover-t8.jpg'),
  t9: require('../../assets/demo/cover-t9.jpg'), t10: require('../../assets/demo/cover-t10.jpg'),
  t11: require('../../assets/demo/cover-t11.jpg'), t12: require('../../assets/demo/cover-t12.jpg'),
  t13: require('../../assets/demo/cover-t13.jpg'),
};

const WORK: Record<string, ImageSourcePropType[]> = {
  t1: [require('../../assets/demo/work-t1a.jpg'), require('../../assets/demo/work-t1b.jpg'), require('../../assets/demo/work-t1c.jpg')],
  t2: [require('../../assets/demo/work-t2a.jpg'), require('../../assets/demo/work-t2b.jpg'), require('../../assets/demo/work-t2c.jpg')],
  t3: [require('../../assets/demo/work-t3a.jpg'), require('../../assets/demo/work-t3b.jpg'), require('../../assets/demo/work-t3c.jpg')],
  t4: [require('../../assets/demo/work-t4a.jpg'), require('../../assets/demo/work-t4b.jpg'), require('../../assets/demo/work-t4c.jpg')],
  t5: [require('../../assets/demo/work-t5a.jpg'), require('../../assets/demo/work-t5b.jpg'), require('../../assets/demo/work-t5c.jpg')],
};

// Portraits stay hidden until a booking is confirmed (design: "Photo shows once your booking is confirmed").
const PORTRAIT: Record<string, ImageSourcePropType> = {
  t1: require('../../assets/demo/tasker-t1.jpg'), t2: require('../../assets/demo/tasker-t2.jpg'),
  t3: require('../../assets/demo/tasker-t3.jpg'), t4: require('../../assets/demo/tasker-t4.jpg'),
  t5: require('../../assets/demo/tasker-t5.jpg'), t6: require('../../assets/demo/tasker-t6.jpg'),
  t7: require('../../assets/demo/tasker-t7.jpg'), t8: require('../../assets/demo/tasker-t8.jpg'),
  t9: require('../../assets/demo/tasker-t9.jpg'), t10: require('../../assets/demo/tasker-t10.jpg'),
  t11: require('../../assets/demo/tasker-t11.jpg'), t12: require('../../assets/demo/tasker-t12.jpg'),
  t13: require('../../assets/demo/tasker-t13.jpg'),
};

const key = (photo?: string | null) => (photo && photo.startsWith('demo/') ? photo.slice(5) : '');
export const coverPhoto = (photo?: string | null) => COVER[key(photo)];
export const workPhotos = (photo?: string | null) => WORK[key(photo)] ?? [];
export const portraitPhoto = (photo?: string | null) => PORTRAIT[key(photo)];
