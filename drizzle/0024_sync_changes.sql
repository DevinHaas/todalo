CREATE TABLE "sync_changes" (
	"user_id" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"xid" bigint NOT NULL,
	CONSTRAINT "sync_changes_entity_entity_id_pk" PRIMARY KEY("entity","entity_id")
);
--> statement-breakpoint
ALTER TABLE "synced_calendars" ADD COLUMN "tasks_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "sync_changes_user_xid_idx" ON "sync_changes" USING btree ("user_id","xid");--> statement-breakpoint
-- Every write to a cached table marks the changed entity (and, for link rows,
-- the entity they belong to) with the writing transaction's id. Arguments are
-- (entity, id column) pairs. Deletes keep the row: the delta reports an id
-- whose entity no longer exists as deleted.
CREATE OR REPLACE FUNCTION sync_touch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r jsonb;
  i int := 0;
BEGIN
  IF TG_OP = 'DELETE' THEN r := to_jsonb(OLD); ELSE r := to_jsonb(NEW); END IF;
  WHILE i < TG_NARGS LOOP
    IF r->>TG_ARGV[i + 1] IS NOT NULL THEN
      INSERT INTO sync_changes (user_id, entity, entity_id, xid)
      VALUES (r->>'user_id', TG_ARGV[i], r->>TG_ARGV[i + 1], pg_current_xact_id()::text::bigint)
      ON CONFLICT (entity, entity_id) DO UPDATE SET xid = excluded.xid, user_id = excluded.user_id;
    END IF;
    i := i + 2;
  END LOOP;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER sync_tasks AFTER INSERT OR UPDATE OR DELETE ON tasks FOR EACH ROW EXECUTE FUNCTION sync_touch('task', 'id');
--> statement-breakpoint
CREATE TRIGGER sync_task_labels AFTER INSERT OR UPDATE OR DELETE ON task_labels FOR EACH ROW EXECUTE FUNCTION sync_touch('task', 'task_id');
--> statement-breakpoint
CREATE TRIGGER sync_task_comments AFTER INSERT OR UPDATE OR DELETE ON task_comments FOR EACH ROW EXECUTE FUNCTION sync_touch('comment', 'id', 'task', 'task_id');
--> statement-breakpoint
CREATE TRIGGER sync_projects AFTER INSERT OR UPDATE OR DELETE ON projects FOR EACH ROW EXECUTE FUNCTION sync_touch('project', 'id');
--> statement-breakpoint
CREATE TRIGGER sync_sections AFTER INSERT OR UPDATE OR DELETE ON sections FOR EACH ROW EXECUTE FUNCTION sync_touch('section', 'id');
--> statement-breakpoint
CREATE TRIGGER sync_labels AFTER INSERT OR UPDATE OR DELETE ON labels FOR EACH ROW EXECUTE FUNCTION sync_touch('label', 'id');
--> statement-breakpoint
CREATE TRIGGER sync_saved_filters AFTER INSERT OR UPDATE OR DELETE ON saved_filters FOR EACH ROW EXECUTE FUNCTION sync_touch('filter', 'id');
--> statement-breakpoint
CREATE TRIGGER sync_goals AFTER INSERT OR UPDATE OR DELETE ON goals FOR EACH ROW EXECUTE FUNCTION sync_touch('goal', 'id');
--> statement-breakpoint
CREATE TRIGGER sync_goal_projects AFTER INSERT OR UPDATE OR DELETE ON goal_projects FOR EACH ROW EXECUTE FUNCTION sync_touch('goalLink', 'id');
--> statement-breakpoint
CREATE TRIGGER sync_goal_tasks AFTER INSERT OR UPDATE OR DELETE ON goal_tasks FOR EACH ROW EXECUTE FUNCTION sync_touch('goalLink', 'id');
--> statement-breakpoint
CREATE TRIGGER sync_seasons AFTER INSERT OR UPDATE OR DELETE ON seasons FOR EACH ROW EXECUTE FUNCTION sync_touch('season', 'id');
--> statement-breakpoint
CREATE TRIGGER sync_season_goals AFTER INSERT OR UPDATE OR DELETE ON season_goals FOR EACH ROW EXECUTE FUNCTION sync_touch('season', 'season_id');
