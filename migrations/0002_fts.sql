-- FTS5 for fulltext search on nodes
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  title, content, content=nodes, content_rowid=rowid
);

CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(rowid, title, content) VALUES (NEW.rowid, NEW.title, NEW.content);
END;

CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, title, content) VALUES('delete', OLD.rowid, OLD.title, OLD.content);
END;

CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, title, content) VALUES('delete', OLD.rowid, OLD.title, OLD.content);
  INSERT INTO nodes_fts(rowid, title, content) VALUES (NEW.rowid, NEW.title, NEW.content);
END;
