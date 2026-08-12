import re, pathlib
root = pathlib.Path(r'C:\Users\bluno\Downloads\leadsmanager_atualizado\public_ht_REMONTADO')
for rel in ['admin.html', 'pages/admin.html', 'employee.html', 'pages/employee.html']:
    t = (root / rel).read_text(encoding='utf-8', errors='replace')
    for m in re.finditer(r'.{0,120}clientSearch.{0,160}', t):
        print(f'--- {rel} ---')
        print(m.group(0).replace('\n', ' ')[:280])
        print()
    for m in re.finditer(r'.{0,80}employeeClientSearch.{0,160}', t):
        print(f'--- {rel} emp ---')
        print(m.group(0).replace('\n', ' ')[:280])
        print()
