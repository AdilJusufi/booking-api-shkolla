using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Booking.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRescheduledToAppointmentId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "RescheduledToAppointmentId",
                table: "Appointments",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Appointments_RescheduledToAppointmentId",
                table: "Appointments",
                column: "RescheduledToAppointmentId");

            migrationBuilder.AddForeignKey(
                name: "FK_Appointments_Appointments_RescheduledToAppointmentId",
                table: "Appointments",
                column: "RescheduledToAppointmentId",
                principalTable: "Appointments",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Appointments_Appointments_RescheduledToAppointmentId",
                table: "Appointments");

            migrationBuilder.DropIndex(
                name: "IX_Appointments_RescheduledToAppointmentId",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "RescheduledToAppointmentId",
                table: "Appointments");
        }
    }
}
