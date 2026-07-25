import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { branches, branchYards, yards } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const allBranches = await db.select().from(branches).orderBy(branches.name);
    const allBranchYards = await db.select().from(branchYards);
    const allYards = await db.select().from(yards);

    const result = allBranches.map(b => ({
      ...b,
      yards: allBranchYards
        .filter(by => by.branch_id === b.id)
        .map(by => {
          const yard = allYards.find(y => y.id === by.yard_id);
          return yard ? { id: yard.id, code: yard.code, name: yard.name } : null;
        })
        .filter(Boolean)
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    
    const [branch] = await db.insert(branches).values({ name }).returning();
    res.json(branch);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { name, active } = req.body;
    const [branch] = await db
      .update(branches)
      .set({ name, active, updated_at: new Date() })
      .where(eq(branches.id, req.params.id))
      .returning();
      
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    res.json(branch);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const [branch] = await db
      .update(branches)
      .set({ active: false, updated_at: new Date() })
      .where(eq(branches.id, req.params.id))
      .returning();
      
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    res.json(branch);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/yards', async (req, res, next) => {
  try {
    const { yard_ids } = req.body;
    if (!Array.isArray(yard_ids)) return res.status(400).json({ error: 'yard_ids must be an array' });
    
    // Clear existing for this branch and re-insert, or just insert new ones? 
    // The design says "Assign yards (body: { yard_ids: string[] })". Usually that's a sync operation.
    await db.delete(branchYards).where(eq(branchYards.branch_id, req.params.id));
    
    if (yard_ids.length > 0) {
      await db.insert(branchYards).values(
        yard_ids.map(yId => ({ branch_id: req.params.id, yard_id: yId }))
      );
    }
    
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
