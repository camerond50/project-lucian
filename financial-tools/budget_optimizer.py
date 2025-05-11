# Budget Optimizer Script
income = 6371  # Example income, adjust as necessary
expenses = {
    "Mortgage": 1806.11,
    "Utilities": 300,
    "Groceries": 600,
    "Subscriptions": 200,
}

savings_target = income - sum(expenses.values())
print(f"Projected Monthly Savings: ${savings_target}")
