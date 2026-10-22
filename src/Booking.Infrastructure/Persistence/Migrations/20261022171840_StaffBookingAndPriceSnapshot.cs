using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Booking.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class StaffBookingAndPriceSnapshot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // VETËM SHTESË — asnjë rresht ekzistues s'rishkruhet:
            //  • PatientProfiles.DateOfBirth/Gender bëhen nullable (DROP NOT NULL, pa prekur vlerat)
            //    që recepsioni të hapë pacient pa këto të dhëna.
            //  • Appointments.BookedByClinic (default false — PostgreSQL 11+ e shton pa rishkruar tabelën),
            //    Price/Currency (null për terminet e vjetra; çmimi i tyre lexohet nga vlerat aktuale).
            migrationBuilder.AlterColumn<int>(
                name: "Gender",
                table: "PatientProfiles",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AlterColumn<DateOnly>(
                name: "DateOfBirth",
                table: "PatientProfiles",
                type: "date",
                nullable: true,
                oldClrType: typeof(DateOnly),
                oldType: "date");

            migrationBuilder.AddColumn<bool>(
                name: "BookedByClinic",
                table: "Appointments",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Currency",
                table: "Appointments",
                type: "character varying(3)",
                maxLength: 3,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Price",
                table: "Appointments",
                type: "numeric(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BookedByClinic",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "Currency",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "Price",
                table: "Appointments");

            migrationBuilder.AlterColumn<int>(
                name: "Gender",
                table: "PatientProfiles",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.AlterColumn<DateOnly>(
                name: "DateOfBirth",
                table: "PatientProfiles",
                type: "date",
                nullable: false,
                defaultValue: new DateOnly(1, 1, 1),
                oldClrType: typeof(DateOnly),
                oldType: "date",
                oldNullable: true);
        }
    }
}
