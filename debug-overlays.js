
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
    const overlays = await prisma.product_overlays.findMany();
    console.log("Total Overlays:", overlays.length);
    overlays.forEach(o => {
        console.log(`ID: ${o.id}, Shop: ${o.shop_id}, Status: '${o.status}', ProductID: '${o.product_id}'`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
