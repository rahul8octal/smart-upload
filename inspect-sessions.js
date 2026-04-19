
import prisma from "./app/db.server.js";

async function main() {
    const sessions = await prisma.session.findMany();
    console.log("Total sessions:", sessions.length);
    sessions.forEach(s => {
        console.log(`Shop: ${s.shop}, IsOnline: ${s.isOnline}, ID: ${s.id}`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
