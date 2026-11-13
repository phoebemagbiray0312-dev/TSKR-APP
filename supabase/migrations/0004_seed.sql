-- ================= config (section 11) =================
insert into public.app_config(key, value, status, description) values
 ('signup_bonus',               '1000', 'agreed', 'Coins given when a tasker is approved'),
 ('coin_pack_coins',            '1000', 'agreed', 'Coins per pack'),
 ('coin_pack_php',              '1000', 'agreed', 'Price of one coin pack (PHP)'),
 ('booking_fee',                '300',  'agreed', 'Booking fee, new client (coins)'),
 ('repeat_client_fee',          '100',  'agreed', 'Booking fee, repeat client (coins)'),
 ('delivery_fee',               '50',   'agreed', 'Delivery booking fee (coins)'),
 ('free_skills',                '2',    'agreed', 'Free skills per tasker'),
 ('max_skills',                 '5',    'agreed', 'Max skills per tasker'),
 ('extra_skill_fee',            '100',  'agreed', 'Coins per extra skill per week'),
 ('max_radius_km',              '6',    'agreed', 'Max service radius (km)'),
 ('late_cancel_fee_php',        '100',  'agreed', 'Client late-cancel fee, paid to tasker QR'),
 ('free_late_cancels_per_month','1',    'agreed', 'Free late cancels per client per month'),
 ('tasker_late_minutes',        '15',   'agreed', 'Tasker late threshold past ETA'),
 ('tasker_wait_minutes',        '15',   'agreed', 'Tasker wait before "client absent"'),
 ('strike1_coins',              '100',  'agreed', 'Strike 1 penalty (coins)'),
 ('strike2_coins',              '200',  'agreed', 'Strike 2 penalty (coins)'),
 ('strike3_pause_days',         '7',    'agreed', 'Pause length at strike 3 (days)'),
 ('free_bookings_per_day',      '1',    'agreed', 'Free client bookings per day'),
 ('plus_active_bookings',       '5',    'agreed', 'TSKR Plus active bookings'),
 ('plus_price_php',             '149',  'placeholder', 'TSKR Plus monthly price'),
 ('available_now_minutes',      '45',   'placeholder', '"Available now" = can arrive within N minutes'),
 ('verification_review_text',   '"24–48 hours"', 'placeholder', 'Verification review time shown'),
 ('face_match_threshold',       '0.8',  'agreed', 'Below this face-match score, flag for manual review'),
 ('otp_resend_cooldown_sec',    '60',   'agreed', 'Seconds before a code can be resent'),
 ('otp_demo_mode',              'true', 'placeholder', 'TESTING: fixed demo codes, no real SMS/email. Turn off for production.'),
 ('demo_email_code',            '"482913"', 'placeholder', 'Prototype email code'),
 ('demo_sms_code',              '"135790"', 'placeholder', 'Prototype SMS code'),
 ('demo_arrival_code',          '"4827"',   'placeholder', 'Prototype arrival code'),
 ('payments_demo_mode',         'true', 'placeholder', 'TESTING: Buy coins succeeds without a gateway. Turn off for production.'),
 ('require_payment_qr',         'true', 'agreed', 'Taskers need an approved payment QR before sending offers')
on conflict (key) do nothing;

-- ================= skills (about 40, dropdown by category) =================
insert into public.skill_categories(name, sort) values
 ('Repairs',1),('Cleaning',2),('Tech',3),('Delivery',4),('Lessons',5),('Health',6),('Care',7),('Garden',8),
 ('Pets',9),('Auto',10),('Home',11),('Events',12),('Creative',13),('Legal',14),('Beauty',15),('Fitness and wellness',16)
on conflict (name) do nothing;

insert into public.skills(category_id, name, is_delivery, needs_license)
select c.id, s.name, s.deliv, s.lic from (values
 ('Repairs','Aircon cleaning',false,false),('Repairs','Aircon repair',false,false),('Repairs','Plumbing',false,false),
 ('Repairs','Electrical work',false,true),('Repairs','Carpentry',false,false),('Repairs','Appliance repair',false,false),
 ('Cleaning','House cleaning',false,false),('Cleaning','Deep cleaning',false,false),('Cleaning','Laundry and ironing',false,false),
 ('Cleaning','Sofa and mattress cleaning',false,false),
 ('Tech','Computer repair',false,false),('Tech','Phone repair',false,false),('Tech','Wi-Fi and network setup',false,false),
 ('Delivery','Item delivery (motorcycle)',true,false),('Delivery','Pasabuy',true,false),
 ('Lessons','Tutoring',false,false),('Lessons','Music lessons',false,false),('Lessons','AI teacher',false,false),
 ('Health','Home nursing',false,true),('Health','Caregiver',false,false),
 ('Care','Babysitting',false,false),('Care','Elderly care',false,false),
 ('Garden','Gardening',false,false),('Garden','Grass cutting',false,false),
 ('Pets','Pet grooming',false,false),('Pets','Pet sitting',false,false),('Pets','Dog walking',false,false),
 ('Auto','Car wash',false,false),('Auto','Battery replacement',false,false),('Auto','Driver for hire (client''s car only)',false,false),
 ('Home','Tile setter',false,false),('Home','Solar panel cleaning',false,false),('Home','CCTV installer',false,false),('Home','Painting',false,false),
 ('Events','Host',false,false),('Events','Clown',false,false),('Events','Referee',false,false),('Events','Musician',false,false),('Events','Barista',false,false),
 ('Creative','Photographer',false,false),('Creative','Graphic artist',false,false),('Creative','Video editor',false,false),
 ('Legal','Lawyer',false,true),('Legal','Notary',false,true),
 ('Beauty','Barber',false,false),('Beauty','Hair and makeup',false,false),
 ('Fitness and wellness','Fitness coach',false,false),('Fitness and wellness','Wellness coach',false,false)
) as s(cat, name, deliv, lic) join public.skill_categories c on c.name = s.cat
on conflict (name) do nothing;

-- ================= banned terms (4.2) =================
insert into public.banned_terms(term, kind) values
 ('massage','personal_service'),('masahe','personal_service'),('escort','personal_service'),('usher','personal_service'),
 ('usherette','personal_service'),('model','personal_service'),('modeling','personal_service'),('modelling','personal_service'),
 ('companion','personal_service'),('hostess','personal_service'),
 ('hatid','passenger'),('ride-hailing','passenger'),('ride hailing','passenger'),('ride-sharing','passenger'),
 ('ride sharing','passenger'),('angkas','passenger'),('passenger','passenger'),('habal','passenger')
on conflict do nothing;
