import { NextResponse } from 'next/server';
import { db } from '@/configs/db';
import { classroomsTable, membershipsTable, usersTable } from '@/configs/schema';
import { eq, and } from 'drizzle-orm';
import { currentUser } from '@clerk/nextjs/server';
import { checkUserBlock } from '@/lib/auth-utils';
import { ApiError, buildErrorResponse } from '@/lib/error-handler';
import { parseAndValidateRequest } from '@/lib/validations/validate';
import { joinClassroomSchema } from '@/lib/validations/classroom';

export async function POST(req: Request) {
    try {
        const { errorResponse, data } = await parseAndValidateRequest(req, joinClassroomSchema);
        if (errorResponse) return errorResponse;

        const { inviteCode } = data;

        const user = await currentUser();
        if (!user || !user.primaryEmailAddress?.emailAddress) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const email = user.primaryEmailAddress.emailAddress;

        // 0. Check if user is blocked
        const { isBlocked, errorResponse: blockErrorResponse } = await checkUserBlock(email);
        if (isBlocked) return blockErrorResponse;

        // 1. Find the classroom by invite code
        const newMembership = await db.transaction(async (tx) => {
            const [classroom] = await tx
                .select()
                .from(classroomsTable)
                .where(eq(classroomsTable.inviteCode, inviteCode.toUpperCase()));

            if (!classroom) {
                throw new ApiError(404, 'Invalid invite code');
            }

            const [existingMember] = await tx
                .select()
                .from(membershipsTable)
                .where(
                    and(eq(membershipsTable.userEmail, email), eq(membershipsTable.classroomId, classroom.id))
                );

            if (existingMember) {
                throw new ApiError(400, 'Already a member of this classroom');
            }

            const [dbUser] = await tx.select().from(usersTable).where(eq(usersTable.email, email));
            const role = dbUser?.role || 'student';

            const [membership] = await tx.insert(membershipsTable).values({
                userEmail: email,
                classroomId: classroom.id,
                role,
            }).returning();

            return {
                membership,
                classroom,
            };
        });

        return NextResponse.json({
            success: true,
            classroom: {
                id: newMembership.classroom.id,
                name: newMembership.classroom.name,
                university: newMembership.classroom.university,
            },
        });
    } catch (error) {
        const { status, body } = buildErrorResponse(error);
        return NextResponse.json(body, { status });
    }
}
