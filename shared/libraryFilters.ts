export type LibraryFilters = {
  domain?: string;
  addedFrom?: Date;
  addedTo?: Date;
  readingStatus?: "unread" | "reading" | "read" | "archived";
  pinned?: boolean;
};
