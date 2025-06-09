import { NextResponse } from 'next/server';
import { withCompanyAuth, AuthenticatedCompanyRequest } from '@/middleware/companyAuth';
import prisma from '@/lib/prisma';

async function launchCampaign(req: AuthenticatedCompanyRequest) {
  try {
    const body = await req.json();
    const { title, description, budget, endDate, maxInternships, paymentMethod, transactionId } = body;

    // Validate required fields
    if (!title || !budget || !endDate || !maxInternships || !paymentMethod) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get user's company
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { company: true }
    });

    if (!user?.company) {
      return NextResponse.json(
        { success: false, message: 'Company not found' },
        { status: 404 }
      );
    }

    // Create campaign with payment in transaction
    const campaign = await prisma.$transaction(async (tx) => {
      // Create campaign
      const newCampaign = await tx.campaign.create({
        data: {
          title,
          description,
          budget: parseFloat(budget),
          endDate: new Date(endDate),
          maxInternships: parseInt(maxInternships),
          companyId: user.company!.id,
          status: 'ACTIVE'
        }
      });

      // Create payment record
      await tx.campaignPayment.create({
        data: {
          campaignId: newCampaign.id,
          amount: parseFloat(budget),
          paymentMethod,
          transactionId,
          status: transactionId ? 'COMPLETED' : 'PENDING'
        }
      });

      return newCampaign;
    });

    return NextResponse.json({
      success: true,
      message: 'Campaign launched successfully',
      campaign: {
        id: campaign.id,
        title: campaign.title,
        description: campaign.description,
        budget: campaign.budget,
        status: campaign.status,
        maxInternships: campaign.maxInternships,
        endDate: campaign.endDate
      }
    });

  } catch (error) {
    console.error('Launch campaign error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to launch campaign' },
      { status: 500 }
    );
  }
}

async function getCampaigns(req: AuthenticatedCompanyRequest) {
  try {
    // Get user's company
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { company: true }
    });

    if (!user?.company) {
      return NextResponse.json(
        { success: false, message: 'Company not found' },
        { status: 404 }
      );
    }

    // Fetch campaigns with payment info and internship count
    const campaigns = await prisma.campaign.findMany({
      where: { companyId: user.company.id },
      include: {
        payment: true,
        internships: {
          select: { id: true, title: true, isActive: true }
        },
        _count: {
          select: { internships: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const formattedCampaigns = campaigns.map(campaign => ({
      id: campaign.id,
      title: campaign.title,
      description: campaign.description,
      budget: campaign.budget,
      status: campaign.status,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      maxInternships: campaign.maxInternships,
      currentInternships: campaign._count.internships,
      createdAt: campaign.createdAt,
      payment: {
        status: campaign.payment?.status,
        paidAt: campaign.payment?.paidAt,
        paymentMethod: campaign.payment?.paymentMethod
      },
      internships: campaign.internships
    }));

    return NextResponse.json({
      success: true,
      campaigns: formattedCampaigns
    });

  } catch (error) {
    console.error('Get campaigns error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch campaigns' },
      { status: 500 }
    );
  }
}

export const POST = withCompanyAuth(launchCampaign);
export const GET = withCompanyAuth(getCampaigns);