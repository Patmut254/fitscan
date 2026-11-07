from django.db import migrations

STATEMENTS = [
    "I have read the participant information sheet for this study and have had the chance to ask questions.",
    "I understand that taking part is voluntary and that I can withdraw at any time without giving a reason.",
    "I agree to have my body measured with a tape measure and with two photos taken on this phone.",
    "I understand that the photos are analysed on this phone and are never saved or sent anywhere.",
    "I understand that my measurements are stored under a participant number, without my name or contact details.",
    "I agree to take part in this study.",
]


def create(apps, schema_editor):
    ConsentForm = apps.get_model("study", "ConsentForm")
    if not ConsentForm.objects.exists():
        ConsentForm.objects.create(
            version=1,
            title="Consent to take part in the FitScan study",
            intro="Please read each statement. Tick it if you agree. Then type your initials to sign.",
            statements=STATEMENTS,
        )


class Migration(migrations.Migration):
    dependencies = [("study", "0004_consent")]
    operations = [migrations.RunPython(create, migrations.RunPython.noop)]
