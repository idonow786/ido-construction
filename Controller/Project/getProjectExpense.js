const ProjectExpense = require('../../Model/ProjectExoense');
const ProjectC = require('../../Model/projectConstruction');
const Invoice = require('../../Model/Invoices');
const mongoose = require('mongoose');

const getProjectExpenses = async (req, res) => {
  try {
    const { projectId } = req.body;

    if (!projectId) {
      return res.status(400).json({ message: 'Project ID is required' });
    }

    // Convert string projectId to ObjectId for proper querying
    const projectObjectId = new mongoose.Types.ObjectId(projectId);

    // Get project, expenses and invoices with proper ObjectId matching
    const [project, expenses, invoices] = await Promise.all([
      ProjectC.findById(projectObjectId)
        .populate('vendorsAndSuppliers.entity')
        .populate('materials.inventoryItem'),
      ProjectExpense.find({ projectId: projectObjectId }).sort({ date: -1 }),
      Invoice.find({ 
        ProjectId: projectObjectId  // Changed to match your model's field name
      })
      .populate('CustomerId')
      .sort({ InvoiceDate: -1 })
    ]);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Helper function to safely calculate totals
    const calculateTotal = (items = [], key = 'amount') => {
      return items.reduce((sum, item) => {
        const value = Number(item[key]) || 0;
        return sum + value;
      }, 0);
    };

    // Process expenses by category
    const expensesByCategory = expenses.reduce((acc, expense) => {
      const category = expense.category || 'Uncategorized';
      
      if (!acc[category]) {
        acc[category] = {
          total: 0,
          items: []
        };
      }

      // Calculate total from subcategories
      const subcategoriesTotal = calculateTotal(expense.subcategories);
      
      acc[category].items.push({
        id: expense._id,
        description: expense.description,
        amount: subcategoriesTotal, // Use calculated total instead of expense.totalAmount
        date: expense.date,
        paidBy: expense.paidBy,
        isReimbursed: expense.isReimbursed || false,
        subcategories: expense.subcategories || [],
        receipt: expense.receipt || null,
        notes: expense.notes || ''
      });

      acc[category].total = (acc[category].total || 0) + subcategoriesTotal;
      return acc;
    }, {});

    // Process invoices with proper null checks
    const invoiceOverview = {
      total: invoices.reduce((sum, inv) => sum + (Number(inv.InvoiceTotal) || 0), 0),
      paid: invoices.reduce((sum, inv) => 
        inv.Status === 'paid' ? sum + (Number(inv.InvoiceTotal) || 0) : sum, 0),
      pending: invoices.reduce((sum, inv) => 
        inv.Status === 'pending' ? sum + (Number(inv.InvoiceTotal) || 0) : sum, 0),
      overdue: invoices.reduce((sum, inv) => 
        (inv.Status === 'due' || inv.Status === 'overdue') ? sum + (Number(inv.InvoiceTotal) || 0) : sum, 0),
      details: invoices.map(inv => ({
        invoiceId: inv._id,
        invoiceNumber: inv.InvoiceNumber || '',
        clientName: inv.CustomerId?.Name || 'Unknown Client',
        totalAmount: Number(inv.InvoiceTotal) || 0,
        status: inv.Status || 'pending',
        dueDate: inv.InvoiceDate,
        createdAt: inv.createdAt,
        orderNumber: inv.OrderNumber,
        subTotal: Number(inv.SubTotal) || 0,
        vat: Number(inv.Vat) || 0,
        quantity: Number(inv.Quantity) || 0,
        description: inv.Description || '',
        customProperties: inv.customProperties || []
      }))
    };

    // Update financial overview to include invoices
    const financialOverview = {
      budget: {
        total: project.budget?.estimatedBudget || 0,
        breakdown: project.budget?.costBreakdown || {}
      },
      vendorPayments: {
        total: calculateTotal(project.vendorsAndSuppliers, 'paymentAmount'),
        pending: calculateTotal(
          project.vendorsAndSuppliers.filter(e => e.paymentStatus === 'pending'),
          'paymentAmount'
        ),
        paid: calculateTotal(
          project.vendorsAndSuppliers.filter(e => e.paymentStatus === 'paid'),
          'paymentAmount'
        ),
        partial: calculateTotal(
          project.vendorsAndSuppliers.filter(e => e.paymentStatus === 'partial'),
          'paymentAmount'
        ),
        details: project.vendorsAndSuppliers.map(entity => ({
          entityName: entity.entity?.name || 'Unknown',
          entityType: entity.entityType,
          role: entity.role,
          amount: entity.paymentAmount || 0,
          status: entity.paymentStatus || 'pending',
          assignedDate: entity.assignedDate
        }))
      },
      materialCosts: {
        total: project.materials.reduce((sum, material) => 
          sum + ((material.quantityRequired || 0) * (material.inventoryItem?.unitPrice || 0)), 0),
        items: project.materials.map(material => ({
          itemName: material.inventoryItem?.itemName || 'Unknown Item',
          quantity: material.quantityRequired || 0,
          unitPrice: material.inventoryItem?.unitPrice || 0,
          totalCost: (material.quantityRequired || 0) * (material.inventoryItem?.unitPrice || 0),
          status: material.status || 'pending',
          allocatedTo: material.allocatedTo || null
        }))
      },
      expenses: {
        total: Object.values(expensesByCategory).reduce((sum, category) => 
          sum + (category.total || 0), 0),
        categories: expensesByCategory
      },
      resourceCosts: {
        total: calculateTotal(project.resources.map(r => ({ 
          amount: (r.quantity || 0) * (r.unitCost || 0) 
        }))),
        items: project.resources.map(resource => ({
          name: resource.resourceName,
          type: resource.resourceType,
          quantity: resource.quantity || 0,
          unitCost: resource.unitCost || 0,
          totalCost: (resource.quantity || 0) * (resource.unitCost || 0)
        }))
      },
      invoices: invoiceOverview
    };

    // Calculate totals with proper null handling
    const totals = {
      totalBudget: financialOverview.budget.total || 0,
      totalExpenses: (
        financialOverview.expenses.total +
        financialOverview.vendorPayments.total +
        financialOverview.materialCosts.total +
        financialOverview.resourceCosts.total
      ) || 0,
      totalEarnings: (financialOverview.budget.total - (
        financialOverview.expenses.total +
        financialOverview.vendorPayments.total +
        financialOverview.materialCosts.total +
        financialOverview.resourceCosts.total
      )) || 0,
      totalInvoiced: invoiceOverview.total || 0,
      invoicesPaid: invoiceOverview.paid || 0,
      invoicesPending: invoiceOverview.pending || 0,
      invoicesOverdue: invoiceOverview.overdue || 0,
      totalVendorSupplierPayments: {
        total: financialOverview.vendorPayments.total || 0,
        pending: financialOverview.vendorPayments.pending || 0,
        paid: financialOverview.vendorPayments.paid || 0,
        partial: financialOverview.vendorPayments.partial || 0,
        byType: {
          vendors: project.vendorsAndSuppliers
            .filter(e => e.entityType === 'Vendor')
            .reduce((sum, v) => sum + (v.paymentAmount || 0), 0),
          suppliers: project.vendorsAndSuppliers
            .filter(e => e.entityType === 'Supplier')
            .reduce((sum, s) => sum + (s.paymentAmount || 0), 0)
        }
      },
      totalVendorPayments: financialOverview.vendorPayments.total || 0,
      totalMaterialCosts: financialOverview.materialCosts.total || 0,
      totalResourceCosts: financialOverview.resourceCosts.total || 0,
      pendingPayments: financialOverview.vendorPayments.pending || 0,
      completedPayments: financialOverview.vendorPayments.paid || 0,
      partialPayments: financialOverview.vendorPayments.partial || 0,
      budgetUtilization: {
        percentage: ((
          (financialOverview.expenses.total +
          financialOverview.vendorPayments.total +
          financialOverview.materialCosts.total +
          financialOverview.resourceCosts.total) /
          financialOverview.budget.total
        ) * 100 || 0).toFixed(2),
        remaining: (financialOverview.budget.total - (
          financialOverview.expenses.total +
          financialOverview.vendorPayments.total +
          financialOverview.materialCosts.total +
          financialOverview.resourceCosts.total
        )) || 0
      }
    };

    const response = {
      projectId,
      projectName: project.projectName,
      status: project.Status,
      financialOverview: {
        ...financialOverview,
        invoices: invoiceOverview
      },
      totals: {
        ...totals,
        totalInvoiced: invoiceOverview.total,
        invoicesPaid: invoiceOverview.paid,
        invoicesPending: invoiceOverview.pending,
        invoicesOverdue: invoiceOverview.overdue
      },
      transactions: (project.materialTransactions || []).map(transaction => ({
        materialName: transaction.material?.itemName || 'Unknown Material',
        quantity: transaction.quantity || 0,
        type: transaction.transactionType,
        date: transaction.date,
        performedBy: transaction.performedBy
      }))
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching project expenses:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        message: 'Invalid project ID format',
        error: error.message 
      });
    }
    res.status(500).json({ 
      message: 'An error occurred while fetching project expenses',
      error: error.message 
    });
  }
};

module.exports = { getProjectExpenses };