CREATE TABLE `restaurant` (
  `id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
  `owner` text NOT NULL,
  `settings` text NOT NULL,
  `revision` integer NOT NULL
);
