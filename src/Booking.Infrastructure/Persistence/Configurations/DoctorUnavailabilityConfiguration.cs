using Booking.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Booking.Infrastructure.Persistence.Configurations;

public class DoctorUnavailabilityConfiguration : IEntityTypeConfiguration<DoctorUnavailability>
{
    public void Configure(EntityTypeBuilder<DoctorUnavailability> builder)
    {
        builder.Property(u => u.Reason).HasMaxLength(500);

        builder.HasIndex(u => new { u.DoctorId, u.StartDateTime, u.EndDateTime });

        builder.HasOne(u => u.Doctor)
            .WithMany()
            .HasForeignKey(u => u.DoctorId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne<ClinicBranch>()
            .WithMany()
            .HasForeignKey(u => u.ClinicBranchId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.ToTable(t => t.HasCheckConstraint(
            "CK_DoctorUnavailabilities_Times",
            "\"EndDateTime\" > \"StartDateTime\""));
    }
}
