ALTER TABLE service_prices
  ADD COLUMN own_materials_price double precision NOT NULL DEFAULT 0 CHECK (own_materials_price >= 0),
  ADD COLUMN club_materials_price double precision NOT NULL DEFAULT 0 CHECK (club_materials_price >= 0);

ALTER TABLE reservation_pricing
  ADD COLUMN price_variant varchar NOT NULL DEFAULT 'standard',
  ADD CONSTRAINT reservation_pricing_variant_check CHECK (price_variant IN ('standard', 'own_materials', 'club_materials'));
