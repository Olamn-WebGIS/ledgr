insert into public.products (name, current_stock, cost_price, selling_price)
values
    ('Notebook', 20, 2.50, 4.99),
    ('Pen', 100, 0.75, 1.49)
on conflict do nothing;
