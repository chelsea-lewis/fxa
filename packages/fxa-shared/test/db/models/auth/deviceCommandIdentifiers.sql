CREATE TABLE IF NOT EXISTS deviceCommandIdentifiers (
  commandId INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  commandName VARCHAR(191) NOT NULL UNIQUE KEY
) ENGINE=InnoDB;