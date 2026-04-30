-- Migration 002: Seed 37 clients. Only runs if table is empty.
INSERT INTO clients (name, display_order)
SELECT name, display_order FROM (VALUES
  ('Dobson', 1), ('Creekside', 2), ('Pilot Mountain', 3), ('King', 4),
  ('Elkin', 5), ('East Bend', 6), ('JMS Brunswick', 7), ('JMS Holly Springs', 8),
  ('JMS Jensen Beach', 9), ('JMS Mooresville', 10), ('JMS Mooresville 2', 11),
  ('JMS Mooresville 3', 12), ('JMS Rural Hall', 13), ('JMS Salisbury', 14),
  ('Canton', 15), ('NWA Storage', 16), ('CJ Trust', 17), ('Hartland', 18),
  ('Kenosha', 19), ('Lakeland', 20), ('Madison', 21), ('1912 Walton', 22),
  ('8th St', 23), ('Airport', 24), ('Broyles', 25), ('Centerton', 26),
  ('Joyce', 27), ('Oak St', 28), ('Pleasant St 1', 29), ('Pleasant St 2', 30),
  ('Robinson', 31), ('Shady Grove', 32), ('Trafalgar', 33), ('Walton', 34),
  ('Fond du Lac', 35), ('Fond du Lac Business Savings', 36), ('Lakeside Truck Rentals', 37)
) AS v(name, display_order)
WHERE NOT EXISTS (SELECT 1 FROM clients LIMIT 1);
