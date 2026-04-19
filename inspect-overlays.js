
import prisma from "./app/db.server.js";

async function main() {
    const count = await prisma.product_overlays.count({
        where: { shop_id: 'klapshoes.myshopify.com' }
    });
    console.log(`Overlays for klapshoes.myshopify.com: ${count}`);

    const allShops = await prisma.product_overlays.findMany({
        select: { shop_id: true },
        distinct: ['shop_id']
    });
    console.log('Shops with overlays:', allShops.map(s => s.shop_id));
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
