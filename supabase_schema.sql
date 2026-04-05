-- Run this in your Supabase SQL editor

-- 1. Locations table (replaces locations.csv)
create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  type text,
  category text,
  lat float,
  lon float,
  cost float
);

-- 2. Trips table
create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text,
  city text,
  days int,
  cost float,
  status text default 'Upcoming',
  start_date date,
  end_date date,
  weather_condition text,
  weather_temp float,
  forecast jsonb default '{}',
  created_at timestamptz default now()
);

-- 3. Trip spots table (replaces plan_df)
create table if not exists trip_spots (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade not null,
  name text,
  city text,
  category text,
  type text,
  lat float,
  lon float,
  cost float,
  day_num int,
  slot text
);

-- 4. Row Level Security
alter table trips enable row level security;
alter table trip_spots enable row level security;
alter table locations enable row level security;

-- Users can only access their own trips
create policy "users own trips" on trips
  for all using (auth.uid() = user_id);

-- Users can only access spots belonging to their trips
create policy "users own trip spots" on trip_spots
  for all using (
    trip_id in (select id from trips where user_id = auth.uid())
  );

-- Locations are readable by anyone (authenticated)
create policy "locations public read" on locations
  for select using (true);

-- 5. Seed locations from CSV
-- After running this schema, go to Supabase Dashboard > Table Editor > locations
-- and use the CSV import feature to upload your locations.csv file.
-- Or use the Supabase CLI: supabase db seed
