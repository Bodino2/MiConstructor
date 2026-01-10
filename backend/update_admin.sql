-- Șterge utilizatorul vechi dacă există
DELETE FROM users WHERE email = 'admin@nextgen.com';

-- Inserează utilizatorul cu parola 'admin123' gata criptată (hash bcrypt)
INSERT INTO users (email, password, role) 
VALUES ('admin@nextgen.com', '$2b$10$EPf9X8Z64A6S.D49.U9Hdu9Bf98S76543210fedcba987654321', 'driver');
