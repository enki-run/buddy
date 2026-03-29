-- Add optional URL field to nodes for external links (product pages, docs, RFCs, etc.)
ALTER TABLE nodes ADD COLUMN url TEXT;
