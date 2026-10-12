-- Replace the synthetic 40-item demo with the ten artwork files supplied by
-- the shop owner. Historical orders keep their item snapshots; old products
-- are unpublished instead of being deleted out from under order records.
update public.products
set active = false, updated_at = now()
where slug in (
  'coastline', 'a-brighter-tomorrow', 'the-midnight-river', 'bauhaus-1923',
  'good-things-happen-here', 'riverdale-university', 'le-jardin', 'higher-together',
  'second-gear', 'nightline-gt', 'after-the-chicane', 'lap-one', 'desert-postcard',
  'blue-hour-run', 'midnight-service', 'neon-hearts', 'under-the-marquee',
  'red-room-1978', 'orbiting-silence', 'the-last-frame', 'a-stranger-on-b-side',
  'sunday-xi', 'apex-form', 'courtside-84', 'hold-the-line', 'late-set-no-4',
  'blue-tangerine', 'grid-study-01', 'study-in-primary', 'garden-in-july',
  'open-water-no-9', 'after-school-club', 'rain-spirit', 'cape-of-quiet',
  'signal-city', 'pixel-moon', 'dream-frame', 'run-toward-it', 'beyond-the-ridge',
  'electric-sleep'
);

update public.product_printkk_variants
set active = false, updated_at = now()
where product_id in (
  select id from public.products where active = false and slug in (
    'coastline', 'a-brighter-tomorrow', 'the-midnight-river', 'bauhaus-1923',
    'good-things-happen-here', 'riverdale-university', 'le-jardin', 'higher-together',
    'second-gear', 'nightline-gt', 'after-the-chicane', 'lap-one', 'desert-postcard',
    'blue-hour-run', 'midnight-service', 'neon-hearts', 'under-the-marquee',
    'red-room-1978', 'orbiting-silence', 'the-last-frame', 'a-stranger-on-b-side',
    'sunday-xi', 'apex-form', 'courtside-84', 'hold-the-line', 'late-set-no-4',
    'blue-tangerine', 'grid-study-01', 'study-in-primary', 'garden-in-july',
    'open-water-no-9', 'after-school-club', 'rain-spirit', 'cape-of-quiet',
    'signal-city', 'pixel-moon', 'dream-frame', 'run-toward-it', 'beyond-the-ridge',
    'electric-sleep'
  )
);

insert into public.products (slug, name, description, department, category, price_cents, currency, active)
values
  ('fight-club', 'Fight Club', 'Artist-made alternative artwork for the 1999 cult film.', 'Movies', 'Movie Posters', 2800, 'USD', true),
  ('project-hail-mary', 'Project Hail Mary', 'An illustrated print inspired by a deep-space adventure.', 'Movies', 'Movie Posters', 2800, 'USD', true),
  ('slow-down-youre-doing-fine', 'Slow Down, You’re Doing Fine', 'A bold typographic reminder to make room for a slower day.', 'Art & Music', 'Typography Posters', 2800, 'USD', true),
  ('it-is-what-it-is', 'It Is What It Is', 'A vivid, cropped type composition in pink and mint.', 'Art & Music', 'Typography Posters', 2800, 'USD', true),
  ('lemans-zebrawin', 'Le Mans · #ZEBRAWIN', 'A collage-style motorsport artwork celebrating the Le Mans circuit.', 'Cars', 'Car Posters', 2800, 'USD', true),
  ('ferrari-f1', 'Ferrari F1', 'A high-contrast Ferrari racing composition in its original orientation.', 'Cars', 'Car Posters', 2800, 'USD', true),
  ('koi-and-vinyl', 'Koi & Vinyl', 'Koi swim in the grooves of a turquoise record.', 'Art & Music', 'Illustration Posters', 2800, 'USD', true),
  ('big-hero-6', 'Big Hero 6', 'A minimalist red, cream and charcoal film-art composition.', 'Movies', 'Movie Posters', 2800, 'USD', true),
  ('inception', 'Inception', 'A grainy monochrome alternative poster for the dream-bending film.', 'Movies', 'Movie Posters', 2800, 'USD', true),
  ('flynn-rider-wanted', 'Flynn Rider · Wanted', 'A hand-drawn wanted-poster style character illustration.', 'Movies', 'Movie Posters', 2800, 'USD', true)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  department = excluded.department,
  category = excluded.category,
  price_cents = excluded.price_cents,
  currency = excluded.currency,
  active = true,
  updated_at = now();

delete from public.product_images
where product_id in (
  select id from public.products where slug in (
    'coastline', 'a-brighter-tomorrow', 'the-midnight-river', 'bauhaus-1923',
    'good-things-happen-here', 'riverdale-university', 'le-jardin', 'higher-together',
    'second-gear', 'nightline-gt', 'after-the-chicane', 'lap-one', 'desert-postcard',
    'blue-hour-run', 'midnight-service', 'neon-hearts', 'under-the-marquee',
    'red-room-1978', 'orbiting-silence', 'the-last-frame', 'a-stranger-on-b-side',
    'sunday-xi', 'apex-form', 'courtside-84', 'hold-the-line', 'late-set-no-4',
    'blue-tangerine', 'grid-study-01', 'study-in-primary', 'garden-in-july',
    'open-water-no-9', 'after-school-club', 'rain-spirit', 'cape-of-quiet',
    'signal-city', 'pixel-moon', 'dream-frame', 'run-toward-it', 'beyond-the-ridge',
    'electric-sleep'
  )
);

insert into public.product_images (product_id, storage_path, alt_text, kind, position)
select products.id, artwork.storage_path, products.name || ' poster artwork', 'poster', 0
from (values
  ('fight-club', '/posters/1.png'),
  ('project-hail-mary', '/posters/2.png'),
  ('slow-down-youre-doing-fine', '/posters/3.png'),
  ('it-is-what-it-is', '/posters/4.png'),
  ('lemans-zebrawin', '/posters/5.png'),
  ('ferrari-f1', '/posters/6.png'),
  ('koi-and-vinyl', '/posters/7.png'),
  ('big-hero-6', '/posters/8.png'),
  ('inception', '/posters/9.png'),
  ('flynn-rider-wanted', '/posters/10.png')
) as artwork(slug, storage_path)
join public.products as products using (slug)
on conflict (product_id, kind, position) do update set
  storage_path = excluded.storage_path,
  alt_text = excluded.alt_text;
