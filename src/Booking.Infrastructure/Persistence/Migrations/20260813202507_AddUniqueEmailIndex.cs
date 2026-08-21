using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Booking.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// Uniciteti i email-it, i zbatuar NGA VETË databaza.
    ///
    /// Identity-a e mbante këtë me options.User.RequireUniqueEmail, por ajo opsion e
    /// bën email-in njëkohësisht UNIK DHE TË DETYRUESHËM. Pacienti i krijuar nga
    /// recepsioni me telefon shpesh s'ka email fare, prandaj flamuri u hoq dhe
    /// uniciteti kontrollohet në kod (AuthService, AdminPatientService, ClinicAdminService).
    ///
    /// Kontrolli në kod është "lexo pastaj shkruaj": dy kërkesa paralele me të njëjtin
    /// email i kalojnë të dyja. Indeksi më poshtë e mbyll atë vrimë — dhe është më i
    /// fortë se ç'kishte më parë, sepse EmailIndex i Identity-t s'ka qenë kurrë unik.
    ///
    /// Indeks i pjesshëm: NULL-et nuk numërohen, kështu që disa pacientë pa email
    /// bashkëjetojnë. Krahasimi bëhet mbi NormalizedEmail — pra "A@x.com" dhe
    /// "a@x.com" janë i njëjti email, njësoj si te FindByEmailAsync.
    /// </summary>
    public partial class AddUniqueEmailIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                CREATE UNIQUE INDEX "UX_AspNetUsers_NormalizedEmail"
                ON "AspNetUsers" ("NormalizedEmail")
                WHERE "NormalizedEmail" IS NOT NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP INDEX IF EXISTS "UX_AspNetUsers_NormalizedEmail";
                """);
        }
    }
}
