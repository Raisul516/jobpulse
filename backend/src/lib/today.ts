import { sql } from "drizzle-orm";

// Today's date in Bangladesh, worked out inside the database.
// Why not CURRENT_DATE? The database runs on UTC, which is 6 hours behind Bangladesh.
// Between midnight and 6 AM in Dhaka, CURRENT_DATE would still be "yesterday",
// so a job whose deadline was yesterday would wrongly still look open.
export const todayInDhaka = sql`(now() AT TIME ZONE 'Asia/Dhaka')::date`;
